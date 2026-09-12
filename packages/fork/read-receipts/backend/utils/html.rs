//! Helpers for read-receipt (open) tracking pixels embedded in outgoing email
//! HTML. A unique token per message is woven into a pixel URL served by the
//! email service; fetches of that URL record opens on the sender's copy.

#[cfg(test)]
mod test;

use regex::Regex;

/// Path prefix of the email service's public open-tracking pixel endpoint.
pub const OPEN_TRACKING_PATH: &str = "/t/o/";

/// Builds the public pixel URL for a tracking token.
pub fn open_tracking_pixel_url(email_service_base_url: &str, token: &str) -> String {
    format!(
        "{}{}{}",
        email_service_base_url.trim_end_matches('/'),
        OPEN_TRACKING_PATH,
        token
    )
}

/// Appends a 1x1 transparent tracking pixel to an HTML body. The pixel is
/// inserted just before the closing `</body>` tag when present, otherwise
/// appended to the end of the document.
pub fn inject_open_tracking_pixel(html: &str, pixel_url: &str) -> String {
    let pixel = format!(
        r#"<img src="{pixel_url}" alt="" width="1" height="1" border="0" style="height:1px!important;width:1px!important;border-width:0!important;margin:0!important;padding:0!important">"#
    );

    // Byte indices align between the original and its ASCII-lowercased copy.
    match html.to_ascii_lowercase().rfind("</body>") {
        Some(idx) => {
            let mut out = String::with_capacity(html.len() + pixel.len());
            out.push_str(&html[..idx]);
            out.push_str(&pixel);
            out.push_str(&html[idx..]);
            out
        }
        None => format!("{html}{pixel}"),
    }
}

/// Removes Macro open-tracking pixels from an HTML body.
///
/// Outgoing messages quote earlier messages in the thread, and the sender's
/// synced copies of those carry their own tracking pixels; without this pass a
/// reply would re-send (or re-trigger) every pixel in the quoted chain.
/// Matches pixels pointing at `email_service_base_url` as well as any
/// `email-service*.macro.com` host, so bodies that crossed environments are
/// still cleaned.
pub fn strip_open_tracking_pixels(html: &str, email_service_base_url: &str) -> String {
    let base = regex::escape(email_service_base_url.trim_end_matches('/'));
    let path = regex::escape(OPEN_TRACKING_PATH);
    let pattern = format!(
        r#"(?is)<img\b[^>]*\bsrc\s*=\s*["'](?:{base}|https?://email-service[a-z0-9.-]*\.macro\.com){path}[^"']*["'][^>]*/?>"#
    );

    // The pattern is built from constants and an escaped URL, so it always compiles.
    let Ok(re) = Regex::new(&pattern) else {
        return html.to_string();
    };

    re.replace_all(html, "").into_owned()
}

/// Conservative receive-side tracking pixel detection and removal.
///
/// Strips:
/// - Any image with both explicit `width=1` and `height=1` (or "0").
/// - Any image with inline styles forcing both width and height to <= 1px (e.g. `width:1px;height:1px`).
/// - Any Macro `/t/o/` tracking pixel.
///
/// Preserves:
/// - CID inline attachments (`src="cid:..."`).
/// - Normal remote images (logos, product images, illustrations).
pub fn strip_blocked_tracking_pixels(html: &str) -> String {
    // Regex matching an <img> tag and inspecting its attributes
    let Ok(img_re) = Regex::new(r#"(?is)<img\b([^>]*)>"#) else {
        return html.to_string();
    };

    let Ok(width_re) = Regex::new(r#"(?i)\bwidth\s*=\s*["']?\s*([01])\s*(?:px)?["']?"#) else {
        return html.to_string();
    };
    let Ok(height_re) = Regex::new(r#"(?i)\bheight\s*=\s*["']?\s*([01])\s*(?:px)?["']?"#) else {
        return html.to_string();
    };
    let Ok(style_width_re) = Regex::new(r#"(?i)width\s*:\s*([01])(?:px)?"#) else {
        return html.to_string();
    };
    let Ok(style_height_re) = Regex::new(r#"(?i)height\s*:\s*([01])(?:px)?"#) else {
        return html.to_string();
    };
    let Ok(cid_re) = Regex::new(r#"(?i)\bsrc\s*=\s*["']?cid:"#) else {
        return html.to_string();
    };
    let Ok(macro_pixel_re) = Regex::new(
        r#"(?i)\bsrc\s*=\s*["'](?:https?://(?:[a-z0-9.-]*\.)?macro\.com/t/o/[^"']*|https?://[^"']*/t/o/[0-9a-fA-F-]{36}(?:[?#][^"']*)?|/t/o/[^"']*)["']"#,
    ) else {
        return html.to_string();
    };

    img_re
        .replace_all(html, |caps: &regex::Captures| {
            let attrs = &caps[1];

            // Never block CID images
            if cid_re.is_match(attrs) {
                return caps[0].to_string();
            }

            // Block Macro tracking path
            if macro_pixel_re.is_match(attrs) {
                return String::new();
            }

            // Block explicit 1x1 or 0x0
            let has_tiny_dim = width_re.is_match(attrs) && height_re.is_match(attrs);
            if has_tiny_dim {
                return String::new();
            }

            // Block inline style with 1px width and height
            let has_tiny_style = style_width_re.is_match(attrs) && style_height_re.is_match(attrs);
            if has_tiny_style {
                return String::new();
            }

            caps[0].to_string()
        })
        .into_owned()
}
