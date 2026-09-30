//! Public read-receipt tracking pixel endpoint.

use axum::{
    Router,
    extract::{Path, State},
    http::header,
    response::{IntoResponse, Response},
    routing::get,
};
use uuid::Uuid;

use crate::api::context::ApiContext;

#[cfg(test)]
mod test;

const TRANSPARENT_PIXEL_GIF: &[u8] = &[
    0x47, 0x49, 0x46, 0x38, 0x39, 0x61, // GIF89a
    0x01, 0x00, 0x01, 0x00, // 1x1
    0x80, 0x00, 0x00, // global color table with 2 entries
    0x00, 0x00, 0x00, // color 0: black
    0xFF, 0xFF, 0xFF, // color 1: white
    0x21, 0xF9, 0x04, 0x01, 0x00, 0x00, 0x00, 0x00, // transparent index 0
    0x2C, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0x02, 0x02, 0x44, 0x01, 0x00, 0x3B,
];

pub fn router() -> Router<ApiContext> {
    Router::new().route("/o/{token}", get(open_pixel_handler))
}

#[tracing::instrument(skip_all)]
async fn open_pixel_handler(State(ctx): State<ApiContext>, Path(token): Path<String>) -> Response {
    if let Ok(token) = Uuid::parse_str(token.trim()) {
        match email_db_client::read_receipts::record_message_open(&ctx.db, token).await {
            Ok(Some(open)) => {
                tracing::debug!(
                    message_id = %open.message_id,
                    link_id = %open.link_id,
                    thread_id = %open.thread_db_id,
                    open_count = open.open_count,
                    is_first_open = open.is_first_open,
                    "Recorded email open"
                );

                if open.is_first_open {
                    let activity_res =
                        email_db_client::read_receipts::record_email_opened_activity(
                            &ctx.db, &open,
                        )
                        .await;
                    if let Err(activity_err) = activity_res {
                        tracing::error!(
                            error = ?activity_err,
                            message_id = %open.message_id,
                            thread_id = %open.thread_db_id,
                            "Failed to record email open activity event"
                        );
                    }
                }

                let db = ctx.db.clone();
                let internal_api_key = ctx.internal_api_key.to_string();
                tokio::spawn(async move {
                    broadcast_open_event(&db, &internal_api_key, &open).await;
                });
            }
            Ok(None) => {}
            Err(error) => {
                tracing::error!(?error, "Failed to record email open");
            }
        }
    }

    pixel_gif_response()
}

async fn broadcast_open_event(
    db: &sqlx::Pool<sqlx::Postgres>,
    internal_api_key: &str,
    open: &email_db_client::read_receipts::RecordedOpen,
) {
    let user_ids = match fetch_notification_users_for_link(db, open.link_id).await {
        Ok(ids) => ids,
        Err(err) => {
            tracing::warn!(
                error = ?err,
                link_id = %open.link_id,
                "Failed to fetch users for read receipt broadcast"
            );
            return;
        }
    };

    if user_ids.is_empty() {
        return;
    }

    let entities: Vec<model_entity::Entity<'static>> = user_ids
        .into_iter()
        .map(|id| model_entity::EntityType::User.with_entity_string(id))
        .collect();

    let payload = serde_json::json!({
        "messageId": open.message_id.to_string(),
        "threadId": open.thread_db_id.to_string(),
        "openCount": open.open_count,
        "lastOpenedAt": chrono::Utc::now().to_rfc3339(),
    });

    if let Ok(gw_url) = macro_service_urls::ConnectionGatewayUrl::new() {
        let client = connection_gateway_client::client::ConnectionGatewayClient::new(
            internal_api_key.to_string(),
            gw_url.to_string(),
        );
        if let Err(err) = client
            .batch_send_message("email_read_receipt_opened".to_string(), payload, entities)
            .await
        {
            tracing::warn!(
                error = ?err,
                "Failed to broadcast email_read_receipt_opened event"
            );
        }
    }
}

async fn fetch_notification_users_for_link(
    db: &sqlx::Pool<sqlx::Postgres>,
    link_id: Uuid,
) -> anyhow::Result<Vec<String>> {
    let rows = sqlx::query_scalar::<_, String>(
        r#"
        SELECT macro_id FROM email_links WHERE id = $1
        UNION
        SELECT primary_macro_id FROM macro_user_links WHERE link_id = $1
        "#,
    )
    .bind(link_id)
    .fetch_all(db)
    .await?;

    Ok(rows)
}

pub fn pixel_gif_response() -> Response {
    (
        [
            (header::CONTENT_TYPE, "image/gif"),
            (
                header::CACHE_CONTROL,
                "no-cache, no-store, must-revalidate, max-age=0",
            ),
            (header::PRAGMA, "no-cache"),
            (
                header::HeaderName::from_static("x-content-type-options"),
                "nosniff",
            ),
        ],
        TRANSPARENT_PIXEL_GIF,
    )
        .into_response()
}
