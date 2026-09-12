//! Router definitions for read receipts.

use axum::Router;
use axum::routing::{get, post};

use crate::api::context::ApiContext;

/// Public router for recipient mail client open tracking (unauthenticated).
pub fn public_router() -> Router<ApiContext> {
    super::tracking::router()
}

/// Router for message read-receipt tracking status queries.
pub fn messages_router() -> Router<ApiContext> {
    Router::new().route("/tracking", post(super::status::batch_handler))
}

/// Router for read-receipt settings (both per-link and global extension settings).
pub fn settings_router() -> Router<ApiContext> {
    Router::new()
        .route(
            "/read-receipts",
            get(super::settings::get_handler).patch(super::settings::patch_handler),
        )
        .route("/extensions", get(super::settings::get_global_handler))
        .route(
            "/extensions/open-tracking",
            axum::routing::patch(super::settings::patch_global_open_tracking_handler),
        )
        .route(
            "/extensions/pixel-blocking",
            axum::routing::patch(super::settings::patch_global_pixel_blocking_handler),
        )
}
