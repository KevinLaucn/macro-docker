//! Contextual HTML & plain-text segmentation, token protection (`⟦P0⟧`), and
//! safe HTML reconstruction with stable segment IDs.
//!
//! Guarantees that the AI model only ever translates masked text segments and
//! can never inject executable HTML or corrupt tables, line breaks, quotes,
//! links, attachment markers, inline `cid:` images, emails, URLs, order IDs,
//! currency amounts, or quantities.

use regex::Regex;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::LazyLock;

use super::hash::strip_tracking_pixels;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ProtectedToken {
    pub placeholder: String,
    pub original: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ProtectedSegment {
    pub id: String,
    pub masked_text: String,
    pub original_text: String,
    pub tokens: Vec<ProtectedToken>,
}

static TOKEN_PATTERNS: LazyLock<Vec<Regex>> = LazyLock::new(|| {
    vec![
        // Existing placeholders
        Regex::new(r"⟦P\d+⟧").expect("valid placeholder regex"),
        // Inline cid: image / attachment references and bracketed markers
        Regex::new(r"(?i)\[(?:cid|attachment|image):[^\]]+\]|\bcid:[^\s'<>)\]\x22]+")
            .expect("valid cid regex"),
        // URLs
        Regex::new(r"(?i)\b(?:https?://|www\.)[^\s'<>)\]\x22]+").expect("valid url regex"),
        // Email addresses
        Regex::new(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b")
            .expect("valid email regex"),
        // Currency amounts (e.g., $1,234.56, USD 99.00, ¥100, €49.99)
        Regex::new(
            r"(?:[$€£¥₩₹₽₺₫฿]\s*\d[\d,]*(?:\.\d+)?|\b(?:USD|EUR|GBP|CNY|RMB|HKD|JPY|CAD|AUD|SGD|CHF|TWD)\s*\d[\d,]*(?:\.\d+)?\b)",
        )
        .expect("valid currency regex"),
        // Order / invoice / tracking / ticket IDs (e.g., #12345, ORD-2026-001, INV_9981)
        Regex::new(
            r"(?:#[A-Za-z0-9_-]{3,}|\b(?:ORD|INV|PO|SO|TXN|TRK|REF|TICKET|CASE|SKU)[-_][A-Za-z0-9_-]{2,}\b|\b[A-Z]{2,6}-\d{3,}[A-Z0-9-]*\b)",
        )
        .expect("valid order id regex"),
        // Quantities with units (e.g., 10 kg, 5 pcs, x3, 100%)
        Regex::new(
            r"(?i)(?:\b\d+(?:\.\d+)?\s*(?:kg|g|mg|lb|lbs|oz|km|m|cm|mm|ml|l|pcs|pc|ea|boxes|packs|units|%)\b|\b[x×]\s*\d+\b)",
        )
        .expect("valid quantity regex"),
    ]
});

static PLACEHOLDER_FINDER_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"⟦P\d+⟧").expect("valid placeholder finder regex"));

static NUMERIC_OR_PUNCT_ONLY_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"^[\s\d\p{P}\p{S}⟦⟧P]+$").expect("valid numeric/punct regex")
});

/// Check whether a string contains translatable natural language text.
pub fn is_translatable_text(text: &str) -> bool {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return false;
    }
    !NUMERIC_OR_PUNCT_ONLY_RE.is_match(trimmed)
}

/// Mask non-translatable tokens in `input` with `⟦P0⟧`, `⟦P1⟧`, ...
pub fn protect_tokens(input: &str) -> (String, Vec<ProtectedToken>) {
    if input.trim().is_empty() {
        return (input.to_owned(), Vec::new());
    }

    let mut spans: Vec<(usize, usize)> = Vec::new();
    for pattern in TOKEN_PATTERNS.iter() {
        for m in pattern.find_iter(input) {
            let start = m.start();
            let mut end = m.end();
            // Trim trailing punctuation from URLs
            let slice = &input[start..end];
            if slice.starts_with("http://")
                || slice.starts_with("https://")
                || slice.starts_with("www.")
            {
                while end > start {
                    let last = input[start..end].chars().next_back().unwrap_or(' ');
                    if matches!(last, '.' | ',' | ';' | ':' | '!' | '?') {
                        end -= last.len_utf8();
                    } else {
                        break;
                    }
                }
            }
            if end <= start {
                continue;
            }
            let overlaps = spans.iter().any(|&(s, e)| start < e && end > s);
            if !overlaps {
                spans.push((start, end));
            }
        }
    }

    if spans.is_empty() {
        return (input.to_owned(), Vec::new());
    }

    spans.sort_by_key(|&(start, _)| start);
    let mut tokens = Vec::with_capacity(spans.len());
    let mut masked = String::with_capacity(input.len() + spans.len() * 6);
    let mut cursor = 0;

    for (idx, (start, end)) in spans.into_iter().enumerate() {
        if start > cursor {
            masked.push_str(&input[cursor..start]);
        }
        let placeholder = format!("⟦P{idx}⟧");
        tokens.push(ProtectedToken {
            placeholder: placeholder.clone(),
            original: input[start..end].to_owned(),
        });
        masked.push_str(&placeholder);
        cursor = end;
    }
    if cursor < input.len() {
        masked.push_str(&input[cursor..]);
    }

    (masked, tokens)
}

/// Validate that all protected tokens exist in `translated` (and no stray placeholders
/// were hallucinated) and restore the original token values.
pub fn restore_protected_tokens(translated: &str, tokens: &[ProtectedToken]) -> Option<String> {
    for token in tokens {
        if !translated.contains(&token.placeholder) {
            return None;
        }
    }
    for found in PLACEHOLDER_FINDER_RE.find_iter(translated) {
        let ph = found.as_str();
        if !tokens.iter().any(|t| t.placeholder == ph) {
            return None;
        }
    }
    let mut restored = translated.to_owned();
    for token in tokens {
        restored = restored.replace(&token.placeholder, &token.original);
    }
    Some(restored)
}

fn decode_html_entities(input: &str) -> String {
    if !input.contains('&') {
        return input.to_owned();
    }
    input
        .replace("&nbsp;", "\u{00a0}")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&#x27;", "'")
        .replace("&apos;", "'")
        .replace("&amp;", "&")
}

fn escape_html_text(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    for ch in input.chars() {
        match ch {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            _ => out.push(ch),
        }
    }
    out
}

#[derive(Debug, Clone)]
enum HtmlPart {
    Verbatim(String),
    Translatable {
        segment_id: String,
        leading_ws: String,
        trailing_ws: String,
        raw_html_text: String,
    },
}

#[derive(Debug, Clone)]
pub struct HtmlTranslationTemplate {
    parts: Vec<HtmlPart>,
    pub segments: Vec<ProtectedSegment>,
}

fn parse_tag_name(tag: &str) -> Option<(bool, String)> {
    let inner = tag
        .strip_prefix('<')?
        .strip_suffix('>')?
        .trim();
    if inner.starts_with('!') || inner.starts_with('?') {
        return None;
    }
    let (is_closing, rest) = match inner.strip_prefix('/') {
        Some(r) => (true, r.trim_start()),
        None => (false, inner),
    };
    let name: String = rest
        .chars()
        .take_while(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == ':')
        .collect::<String>()
        .to_ascii_lowercase();
    if name.is_empty() {
        None
    } else {
        Some((is_closing, name))
    }
}

fn is_self_closing_tag(tag: &str, name: &str) -> bool {
    tag.trim_end().ends_with("/>")
        || matches!(
            name,
            "area"
                | "base"
                | "br"
                | "col"
                | "embed"
                | "hr"
                | "img"
                | "input"
                | "link"
                | "meta"
                | "param"
                | "source"
                | "track"
                | "wbr"
        )
}

fn is_skipped_tag(name: &str) -> bool {
    matches!(name, "script" | "style" | "code" | "pre" | "noscript" | "svg")
}

/// Extract translatable text node segments from sanitized HTML while keeping all HTML tags,
/// tables, `<br>` line breaks, `<blockquote>` quotes, `<a>` links, and `cid:` images intact.
/// Tracking pixels (`/t/o/` and `/opens/`) are stripped when `strip_pixels` is true.
pub fn extract_html_template(
    html: &str,
    prefix: &str,
    strip_pixels: bool,
) -> HtmlTranslationTemplate {
    let source = if strip_pixels {
        strip_tracking_pixels(html)
    } else {
        html.to_owned()
    };

    let mut parts = Vec::new();
    let mut segments = Vec::new();
    let mut skip_stack: Vec<String> = Vec::new();
    let mut cursor = 0;
    let bytes = source.as_bytes();
    let mut seg_counter = 0usize;

    while cursor < bytes.len() {
        if bytes[cursor] == b'<' {
            if let Some(rel_end) = source[cursor..].find('>') {
                let tag_end = cursor + rel_end + 1;
                let tag_str = &source[cursor..tag_end];
                if let Some((is_closing, tag_name)) = parse_tag_name(tag_str) {
                    if is_skipped_tag(&tag_name) {
                        if is_closing {
                            if let Some(pos) = skip_stack.iter().rposition(|t| t == &tag_name) {
                                skip_stack.truncate(pos);
                            }
                        } else if !is_self_closing_tag(tag_str, &tag_name) {
                            skip_stack.push(tag_name);
                        }
                    }
                }
                parts.push(HtmlPart::Verbatim(tag_str.to_owned()));
                cursor = tag_end;
                continue;
            }
        }

        let next_tag = source[cursor..]
            .find('<')
            .map_or(source.len(), |offset| cursor + offset);
        let raw_slice = &source[cursor..next_tag];
        cursor = next_tag;

        if !skip_stack.is_empty() {
            parts.push(HtmlPart::Verbatim(raw_slice.to_owned()));
            continue;
        }

        let decoded = decode_html_entities(raw_slice);
        let trimmed = decoded.trim();
        if !is_translatable_text(trimmed) {
            parts.push(HtmlPart::Verbatim(raw_slice.to_owned()));
            continue;
        }

        let leading_len = decoded.len() - decoded.trim_start().len();
        let trailing_len = decoded.len() - decoded.trim_end().len();
        let leading_ws = decoded[..leading_len].to_owned();
        let trailing_ws = decoded[decoded.len() - trailing_len..].to_owned();
        let core = &decoded[leading_len..decoded.len() - trailing_len];

        let (masked, tokens) = protect_tokens(core);
        if !is_translatable_text(&masked) {
            parts.push(HtmlPart::Verbatim(raw_slice.to_owned()));
            continue;
        }

        let segment_id = format!("{prefix}_{seg_counter}");
        seg_counter += 1;

        parts.push(HtmlPart::Translatable {
            segment_id: segment_id.clone(),
            leading_ws,
            trailing_ws,
            raw_html_text: raw_slice.to_owned(),
        });
        segments.push(ProtectedSegment {
            id: segment_id,
            masked_text: masked,
            original_text: core.to_owned(),
            tokens,
        });
    }

    HtmlTranslationTemplate { parts, segments }
}

impl HtmlTranslationTemplate {
    /// Reconstruct sanitized HTML by substituting validated segment translations into
    /// their exact text node slots (HTML-escaped so no raw HTML can ever be injected).
    pub fn render(&self, translated_by_id: &HashMap<String, String>) -> String {
        let mut out = String::new();
        for part in &self.parts {
            match part {
                HtmlPart::Verbatim(s) => out.push_str(s),
                HtmlPart::Translatable {
                    segment_id,
                    leading_ws,
                    trailing_ws,
                    raw_html_text,
                } => {
                    if let Some(translated_core) = translated_by_id.get(segment_id) {
                        out.push_str(&escape_html_text(leading_ws));
                        out.push_str(&escape_html_text(translated_core));
                        out.push_str(&escape_html_text(trailing_ws));
                    } else {
                        out.push_str(raw_html_text);
                    }
                }
            }
        }
        out
    }
}

#[derive(Debug, Clone)]
enum TextLinePart {
    Verbatim(String),
    Translatable {
        segment_id: String,
        prefix: String,
        suffix: String,
        original_line: String,
    },
}

#[derive(Debug, Clone)]
pub struct PlainTextTranslationTemplate {
    lines: Vec<TextLinePart>,
    pub segments: Vec<ProtectedSegment>,
}

/// Extract translatable line segments from plain text / Markdown while preserving
/// line breaks (`\n`) and Markdown quote prefixes (`> `).
pub fn extract_text_template(text: &str, prefix: &str) -> PlainTextTranslationTemplate {
    let normalized = text.replace("\r\n", "\n").replace('\r', "\n");
    let raw_lines: Vec<&str> = normalized.split('\n').collect();
    let mut lines = Vec::with_capacity(raw_lines.len());
    let mut segments = Vec::new();
    let mut seg_counter = 0usize;

    for raw_line in raw_lines {
        // Preserve leading whitespace + markdown quote markers `> `
        let mut quote_end = 0;
        for ch in raw_line.chars() {
            if ch.is_whitespace() || ch == '>' {
                quote_end += ch.len_utf8();
            } else {
                break;
            }
        }
        let line_prefix = &raw_line[..quote_end];
        let rest = &raw_line[quote_end..];
        let trimmed = rest.trim_end();
        let line_suffix = &rest[trimmed.len()..];

        if !is_translatable_text(trimmed) {
            lines.push(TextLinePart::Verbatim(raw_line.to_owned()));
            continue;
        }

        let (masked, tokens) = protect_tokens(trimmed);
        if !is_translatable_text(&masked) {
            lines.push(TextLinePart::Verbatim(raw_line.to_owned()));
            continue;
        }

        let segment_id = format!("{prefix}_{seg_counter}");
        seg_counter += 1;

        lines.push(TextLinePart::Translatable {
            segment_id: segment_id.clone(),
            prefix: line_prefix.to_owned(),
            suffix: line_suffix.to_owned(),
            original_line: raw_line.to_owned(),
        });
        segments.push(ProtectedSegment {
            id: segment_id,
            masked_text: masked,
            original_text: trimmed.to_owned(),
            tokens,
        });
    }

    PlainTextTranslationTemplate { lines, segments }
}

impl PlainTextTranslationTemplate {
    pub fn render(&self, translated_by_id: &HashMap<String, String>) -> String {
        let mut rendered_lines = Vec::with_capacity(self.lines.len());
        for line in &self.lines {
            match line {
                TextLinePart::Verbatim(s) => rendered_lines.push(s.clone()),
                TextLinePart::Translatable {
                    segment_id,
                    prefix,
                    suffix,
                    original_line,
                } => {
                    if let Some(translated_core) = translated_by_id.get(segment_id) {
                        rendered_lines.push(format!("{prefix}{translated_core}{suffix}"));
                    } else {
                        rendered_lines.push(original_line.clone());
                    }
                }
            }
        }
        rendered_lines.join("\n")
    }
}
