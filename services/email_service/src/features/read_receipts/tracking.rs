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
                    if let Err(activity_err) =
                        email_db_client::read_receipts::record_email_opened_activity(&ctx.db, &open)
                            .await
                    {
                        tracing::error!(
                            error = ?activity_err,
                            message_id = %open.message_id,
                            thread_id = %open.thread_db_id,
                            "Failed to record email open activity event"
                        );
                    }
                }
            }
            Ok(None) => {}
            Err(error) => {
                tracing::error!(?error, "Failed to record email open");
            }
        }
    }

    (
        [
            (header::CONTENT_TYPE, "image/gif"),
            (
                header::CACHE_CONTROL,
                "no-cache, no-store, must-revalidate, max-age=0",
            ),
            (header::PRAGMA, "no-cache"),
        ],
        TRANSPARENT_PIXEL_GIF,
    )
        .into_response()
}
