//! Deterministic server-side `source_hash` calculation and tracking-pixel stripping.
//!
//! Ensures that read state (`is_read`), labels, `updated_at`, tracking pixels
//! (`/t/o/` and `/opens/`), and ephemeral signed URL parameters (`X-Amz-Signature`,
//! `X-Amz-Date`, `X-Amz-Expires`, `token`, etc.) never alter `source_hash` or
//! trigger duplicate AI translations.

use regex::Regex;
use std::sync::LazyLock;

static TRACKING_PIXEL_IMG_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(
        r#"(?is)<img\b[^>]*?\bsrc\s*=\s*(?:"[^"]*?/(?:t/o|opens)/[^"]*?"|'[^']*?/(?:t/o|opens)/[^']*?'|[^\s>]*?/(?:t/o|opens)/[^\s>]*?)[^>]*?>"#,
    )
    .expect("valid tracking pixel regex")
});

static URL_IN_TEXT_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r#"https?://[^\s"'<>)\]]+"#).expect("valid url regex")
});

const EPHEMERAL_QUERY_KEYS: &[&str] = &[
    "x-amz-algorithm",
    "x-amz-credential",
    "x-amz-date",
    "x-amz-expires",
    "x-amz-security-token",
    "x-amz-signature",
    "x-amz-signedheaders",
    "awsaccesskeyid",
    "signature",
    "sig",
    "expires",
    "token",
];

/// Strip both Fork (`/t/o/`) and official (`/opens/`) read-receipt tracking pixels from HTML.
pub fn strip_tracking_pixels(html: &str) -> String {
    if !html.contains("/t/o/")
        && !html.contains("/opens/")
        && !html.contains("/T/O/")
        && !html.contains("/OPENS/")
    {
        return html.to_owned();
    }
    TRACKING_PIXEL_IMG_RE.replace_all(html, "").into_owned()
}

/// Normalize a single URL by removing volatile presigned query parameters while preserving stable ones.
pub fn normalize_ephemeral_url(raw_url: &str) -> String {
    let Some((base, query_and_frag)) = raw_url.split_once('?') else {
        return raw_url.to_owned();
    };
    let (query, frag) = match query_and_frag.split_once('#') {
        Some((q, f)) => (q, Some(f)),
        None => (query_and_frag, None),
    };

    let mut stable_params: Vec<&str> = Vec::new();
    for pair in query.split('&') {
        if pair.is_empty() {
            continue;
        }
        let key = pair.split_once('=').map_or(pair, |(k, _)| k);
        let key_lower = key.trim().to_ascii_lowercase();
        let is_ephemeral = EPHEMERAL_QUERY_KEYS.contains(&key_lower.as_str())
            || key_lower.starts_with("x-amz-")
            || key_lower.starts_with("x-goog-");
        if !is_ephemeral {
            stable_params.push(pair);
        }
    }

    let mut out = String::with_capacity(raw_url.len());
    out.push_str(base);
    if !stable_params.is_empty() {
        out.push('?');
        out.push_str(&stable_params.join("&"));
    }
    if let Some(f) = frag {
        out.push('#');
        out.push_str(f);
    }
    out
}

/// Normalize stable source content by canonicalizing newlines, stripping tracking pixels,
/// and stripping volatile signed URL query parameters.
pub fn canonicalize_source_segment(input: &str) -> String {
    let without_pixels = strip_tracking_pixels(input);
    let normalized_newlines = without_pixels.replace("\r\n", "\n").replace('\r', "\n");
    if !normalized_newlines.contains("http://") && !normalized_newlines.contains("https://") {
        return normalized_newlines.trim().to_owned();
    }
    URL_IN_TEXT_RE
        .replace_all(&normalized_newlines, |caps: &regex::Captures<'_>| {
            normalize_ephemeral_url(&caps[0])
        })
        .trim()
        .to_owned()
}

/// Compute stable server-side `source_hash` for an email message.
pub fn compute_message_source_hash(
    subject: Option<&str>,
    snippet: Option<&str>,
    body_html_sanitized: Option<&str>,
    body_replyless: Option<&str>,
    body_text: Option<&str>,
    body_macro: Option<&str>,
) -> String {
    let mut payload = String::new();
    payload.push_str("v1:message\n");
    payload.push_str("subject:");
    payload.push_str(&canonicalize_source_segment(subject.unwrap_or_default()));
    payload.push_str("\nsnippet:");
    payload.push_str(&canonicalize_source_segment(snippet.unwrap_or_default()));
    payload.push_str("\nhtml:");
    payload.push_str(&canonicalize_source_segment(
        body_html_sanitized.unwrap_or_default(),
    ));
    payload.push_str("\nreplyless:");
    payload.push_str(&canonicalize_source_segment(
        body_replyless.unwrap_or_default(),
    ));
    payload.push_str("\ntext:");
    payload.push_str(&canonicalize_source_segment(body_text.unwrap_or_default()));
    payload.push_str("\nmacro:");
    payload.push_str(&canonicalize_source_segment(body_macro.unwrap_or_default()));
    sha256_hex(payload.as_bytes())
}

/// Compute stable server-side `source_hash` for a thread title.
pub fn compute_thread_title_source_hash(subject: &str) -> String {
    let mut payload = String::from("v1:thread_title\nsubject:");
    payload.push_str(&canonicalize_source_segment(subject));
    sha256_hex(payload.as_bytes())
}

/// Compute stable server-side `source_hash` for a thread list summary (`subject` + `snippet` + latest message id).
pub fn compute_thread_summary_source_hash(
    latest_message_id: Option<&str>,
    subject: &str,
    snippet: &str,
) -> String {
    let mut payload = String::from("v1:thread_summary\nlatest_msg:");
    payload.push_str(latest_message_id.unwrap_or_default().trim());
    payload.push_str("\nsubject:");
    payload.push_str(&canonicalize_source_segment(subject));
    payload.push_str("\nsnippet:");
    payload.push_str(&canonicalize_source_segment(snippet));
    sha256_hex(payload.as_bytes())
}

/// Pure-Rust FIPS 180-4 SHA-256 implementation returning lowercase 64-character hex.
pub fn sha256_hex(data: &[u8]) -> String {
    const K: [u32; 64] = [
        0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4,
        0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe,
        0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f,
        0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
        0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc,
        0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
        0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116,
        0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
        0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7,
        0xc67178f2,
    ];

    let mut h: [u32; 8] = [
        0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab,
        0x5be0cd19,
    ];

    let bit_len = (data.len() as u64) * 8;
    let mut padded = Vec::with_capacity(((data.len() + 9 + 63) / 64) * 64);
    padded.extend_from_slice(data);
    padded.push(0x80);
    while (padded.len() % 64) != 56 {
        padded.push(0);
    }
    padded.extend_from_slice(&bit_len.to_be_bytes());

    for chunk in padded.chunks_exact(64) {
        let mut w = [0u32; 64];
        for (i, word) in chunk.chunks_exact(4).enumerate() {
            w[i] = u32::from_be_bytes([word[0], word[1], word[2], word[3]]);
        }
        for i in 16..64 {
            let s0 = w[i - 15].rotate_right(7) ^ w[i - 15].rotate_right(18) ^ (w[i - 15] >> 3);
            let s1 = w[i - 2].rotate_right(17) ^ w[i - 2].rotate_right(19) ^ (w[i - 2] >> 10);
            w[i] = w[i - 16]
                .wrapping_add(s0)
                .wrapping_add(w[i - 7])
                .wrapping_add(s1);
        }

        let mut a = h[0];
        let mut b = h[1];
        let mut c = h[2];
        let mut d = h[3];
        let mut e = h[4];
        let mut f = h[5];
        let mut g = h[6];
        let mut hh = h[7];

        for i in 0..64 {
            let s1 = e.rotate_right(6) ^ e.rotate_right(11) ^ e.rotate_right(25);
            let ch = (e & f) ^ ((!e) & g);
            let temp1 = hh
                .wrapping_add(s1)
                .wrapping_add(ch)
                .wrapping_add(K[i])
                .wrapping_add(w[i]);
            let s0 = a.rotate_right(2) ^ a.rotate_right(13) ^ a.rotate_right(22);
            let maj = (a & b) ^ (a & c) ^ (b & c);
            let temp2 = s0.wrapping_add(maj);

            hh = g;
            g = f;
            f = e;
            e = d.wrapping_add(temp1);
            d = c;
            c = b;
            b = a;
            a = temp1.wrapping_add(temp2);
        }

        h[0] = h[0].wrapping_add(a);
        h[1] = h[1].wrapping_add(b);
        h[2] = h[2].wrapping_add(c);
        h[3] = h[3].wrapping_add(d);
        h[4] = h[4].wrapping_add(e);
        h[5] = h[5].wrapping_add(f);
        h[6] = h[6].wrapping_add(g);
        h[7] = h[7].wrapping_add(hh);
    }

    let mut out = String::with_capacity(64);
    for word in h {
        use std::fmt::Write as _;
        let _ = write!(&mut out, "{word:08x}");
    }
    out
}
