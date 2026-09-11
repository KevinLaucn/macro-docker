use super::*;

const BASE_URL: &str = "https://email-service.macro.com";
const TOKEN: &str = "open-tracking-token-test";

#[test]
fn pixel_url_joins_base_and_token() {
    assert_eq!(
        open_tracking_pixel_url(BASE_URL, TOKEN),
        format!("https://email-service.macro.com/t/o/{TOKEN}")
    );
    assert_eq!(
        open_tracking_pixel_url("http://localhost:8087/", TOKEN),
        format!("http://localhost:8087/t/o/{TOKEN}")
    );
}

#[test]
fn inject_appends_when_no_body_tag() {
    let url = open_tracking_pixel_url(BASE_URL, TOKEN);
    let html = "<div>hello</div>";
    let injected = inject_open_tracking_pixel(html, &url);

    assert!(injected.starts_with(html));
    assert!(injected.contains(&format!(r#"<img src="{url}""#)));
}

#[test]
fn inject_inserts_before_closing_body_tag() {
    let url = open_tracking_pixel_url(BASE_URL, TOKEN);
    let html = "<html><BODY><p>hi</p></BODY></html>";
    let injected = inject_open_tracking_pixel(html, &url);

    let pixel_idx = injected.find("<img").unwrap();
    let body_close_idx = injected.find("</BODY>").unwrap();
    assert!(pixel_idx < body_close_idx);
    assert!(injected.ends_with("</BODY></html>"));
}

#[test]
fn strip_removes_own_pixels_only() {
    let url = open_tracking_pixel_url(BASE_URL, TOKEN);
    let html = format!(
        r#"<p>hi</p><img src="{url}" alt="" width="1" height="1"><img src="https://example.com/logo.png">"#
    );

    let stripped = strip_open_tracking_pixels(&html, BASE_URL);

    assert!(!stripped.contains("/t/o/"));
    assert!(stripped.contains("https://example.com/logo.png"));
    assert!(stripped.contains("<p>hi</p>"));
}

#[test]
fn strip_removes_cross_environment_pixels() {
    let html = format!(
        r#"<blockquote><img src="https://email-service-dev.macro.com/t/o/{TOKEN}" width="1" height="1"></blockquote>"#
    );

    let stripped = strip_open_tracking_pixels(&html, BASE_URL);

    assert!(!stripped.contains("/t/o/"));
    assert!(stripped.contains("<blockquote>"));
}

#[test]
fn strip_keeps_lookalike_third_party_pixels() {
    let html = r#"<img src="https://tracker.example.com/t/o/abc" width="1" height="1">"#;

    let stripped = strip_open_tracking_pixels(html, BASE_URL);

    assert_eq!(stripped, html);
}

#[test]
fn inject_after_strip_leaves_one_tracking_pixel() {
    let old_url = open_tracking_pixel_url(BASE_URL, "11111111-2222-3333-4444-555555555555");
    let html = format!(r#"<html><body><p>reply</p><img src="{old_url}" width="1"></body></html>"#);

    let new_url = open_tracking_pixel_url(BASE_URL, TOKEN);
    let cleaned = strip_open_tracking_pixels(&html, BASE_URL);
    let injected = inject_open_tracking_pixel(&cleaned, &new_url);

    assert!(!injected.contains("11111111-2222-3333-4444-555555555555"));
    assert_eq!(injected.matches("/t/o/").count(), 1);
    assert!(injected.contains(TOKEN));
}

#[test]
fn strip_blocked_pixels_removes_1x1_and_preserves_cid_and_regular_images() {
    let html = r#"
        <p>Hello world</p>
        <img src="https://tracker.com/pixel.gif" width="1" height="1" alt="">
        <img src="https://tracker.com/pixel2.gif" style="width: 1px; height: 1px;">
        <img src="https://macro.com/t/o/some-token">
        <img src="cid:image001.png@01D" width="1" height="1">
        <img src="https://cdn.example.com/logo.png" width="200" height="50">
    "#;

    let cleaned = strip_blocked_tracking_pixels(html);

    assert!(!cleaned.contains("pixel.gif"));
    assert!(!cleaned.contains("pixel2.gif"));
    assert!(!cleaned.contains("/t/o/some-token"));
    assert!(cleaned.contains("cid:image001.png@01D"));
    assert!(cleaned.contains("logo.png"));
    assert!(cleaned.contains("<p>Hello world</p>"));
}

#[test]
fn strip_blocked_pixels_keeps_third_party_non_pixel_with_tracking_path() {
    let html = r#"<p>Article</p><img src="https://cdn.example.com/t/o/banner.jpg" width="600" height="200">"#;
    let cleaned = strip_blocked_tracking_pixels(html);
    assert_eq!(cleaned, html);
}

#[test]
fn strip_blocked_pixels_removes_self_hosted_uuid_tracking_pixel() {
    let html = r#"<p>Notice</p><img src="https://email.custom-domain.com/t/o/12345678-1234-1234-1234-123456789abc">"#;
    let cleaned = strip_blocked_tracking_pixels(html);
    assert!(!cleaned.contains("12345678-1234-1234-1234-123456789abc"));
    assert_eq!(cleaned, "<p>Notice</p>");
}

#[test]
fn strip_open_tracking_pixels_handles_self_hosted_cross_origin() {
    let self_host_url = "https://email.custom-domain.com";
    let token = "fedcba98-7654-3210-fedc-ba9876543210";
    let pixel_url = open_tracking_pixel_url(self_host_url, token);
    let html = format!(r#"<blockquote><img src="{pixel_url}"></blockquote>"#);

    let cleaned = strip_open_tracking_pixels(&html, self_host_url);
    assert!(!cleaned.contains(token));
    assert_eq!(cleaned, "<blockquote></blockquote>");
}
