//! Send-side read-receipt (open tracking) preparation and pixel injection.

use anyhow::Context;
use sqlx::PgPool;
use uuid::Uuid;

use models_email::service::message::MessageToSend;

/// Embed a read-receipt tracking pixel in the outgoing HTML when the sending
/// inbox has read receipts enabled.
///
/// Existing Macro tracking pixels are stripped first so replies never resend
/// or retrigger pixels from quoted sent messages. Tracking is deliberately
/// best-effort: a tracking failure must never block delivery of the email.
#[tracing::instrument(skip(db, message_to_send), fields(message_db_id = ?message_to_send.db_id))]
pub async fn attach_open_tracking_pixel(db: &PgPool, message_to_send: &mut MessageToSend) {
    let _ = try_attach_open_tracking_pixel(db, message_to_send)
        .await
        .inspect_err(|error| {
            tracing::warn!(
                ?error,
                message_db_id = ?message_to_send.db_id,
                "Failed to attach open tracking pixel; sending without read receipt tracking"
            );
        });
}

async fn try_attach_open_tracking_pixel(
    db: &PgPool,
    message_to_send: &mut MessageToSend,
) -> anyhow::Result<()> {
    let Some(db_id) = message_to_send.db_id else {
        return Ok(());
    };
    let Some(html) = message_to_send.body_html.as_deref() else {
        return Ok(());
    };

    let internal_url = macro_service_urls::EmailServiceUrl::new()
        .context("unable to resolve email service base url")?
        .to_string();

    // In self-hosted Docker environments the internal service URL
    // (e.g. http://email-service:8080) is unreachable from the internet.
    // EMAIL_SERVICE_PUBLIC_URL provides the publicly reachable origin so
    // tracking pixels embedded in outgoing emails can be fetched by
    // recipient mail clients.
    let public_url = macro_env_var::maybe_read_env("EMAIL_SERVICE_PUBLIC_URL")
        .unwrap_or_else(|| internal_url.clone());

    // Strip existing Macro tracking pixels using both the internal and
    // public URLs so we catch pixels from either origin in quoted replies.
    let mut new_html = email_utils::read_receipts::strip_open_tracking_pixels(html, &internal_url);
    if public_url != internal_url {
        new_html = email_utils::read_receipts::strip_open_tracking_pixels(&new_html, &public_url);
    }

    let link_enabled =
        email_db_client::read_receipts::fetch_read_receipts_enabled(db, message_to_send.link_id)
            .await
            .context("unable to fetch read receipt settings")?;

    let global_enabled = if link_enabled {
        if let Ok(Some(link)) =
            email_db_client::links::get::fetch_link_by_id(db, message_to_send.link_id).await
        {
            email_db_client::read_receipts::fetch_global_extension_settings(
                db,
                link.macro_id.as_ref(),
            )
            .await
            .map(|s| s.email_open_tracking_enabled)
            .unwrap_or(true)
        } else {
            true
        }
    } else {
        false
    };

    if global_enabled && link_enabled {
        let token = Uuid::new_v4();
        email_db_client::read_receipts::set_message_open_tracking_token(
            db,
            db_id,
            message_to_send.link_id,
            token,
        )
        .await
        .context("unable to persist open tracking token")?;

        let pixel_url =
            email_utils::read_receipts::open_tracking_pixel_url(&public_url, &token.to_string());
        new_html = email_utils::read_receipts::inject_open_tracking_pixel(&new_html, &pixel_url);
    }

    message_to_send.body_html = Some(new_html);

    Ok(())
}
