//! Read-receipt preferences endpoints.

use axum::{
    Extension, Json,
    extract::State,
    http::StatusCode,
    response::{IntoResponse, Response},
};
use models_email::service::link::Link;
use serde::{Deserialize, Serialize};
use thiserror::Error;

use crate::api::context::ApiContext;

#[derive(Debug, Clone, Serialize)]
pub struct ReadReceiptsResponse {
    pub read_receipts_enabled: bool,
}

#[derive(Debug, Clone, Deserialize)]
pub struct UpdateReadReceiptsRequest {
    pub read_receipts_enabled: bool,
}

#[derive(Debug, Error)]
pub enum ReadReceiptsError {
    #[error("Failed to read or update read receipt settings")]
    Database(#[from] anyhow::Error),
}

impl IntoResponse for ReadReceiptsError {
    fn into_response(self) -> Response {
        tracing::error!(error = ?self, "read receipt settings error");
        (StatusCode::INTERNAL_SERVER_ERROR, self.to_string()).into_response()
    }
}

#[tracing::instrument(skip(ctx, link))]
pub async fn get_handler(
    State(ctx): State<ApiContext>,
    link: Extension<Link>,
) -> Result<Json<ReadReceiptsResponse>, ReadReceiptsError> {
    let enabled =
        email_db_client::read_receipts::fetch_read_receipts_enabled(&ctx.db, link.id).await?;
    Ok(Json(ReadReceiptsResponse {
        read_receipts_enabled: enabled,
    }))
}

#[tracing::instrument(skip(ctx, link, request))]
pub async fn patch_handler(
    State(ctx): State<ApiContext>,
    link: Extension<Link>,
    Json(request): Json<UpdateReadReceiptsRequest>,
) -> Result<Json<ReadReceiptsResponse>, ReadReceiptsError> {
    let enabled = email_db_client::read_receipts::set_read_receipts_enabled(
        &ctx.db,
        link.id,
        request.read_receipts_enabled,
    )
    .await?;

    Ok(Json(ReadReceiptsResponse {
        read_receipts_enabled: enabled,
    }))
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GlobalExtensionSettingsResponse {
    pub email_open_tracking_enabled: bool,
    pub email_tracking_pixel_blocking_enabled: bool,
}

#[derive(Debug, Clone, Deserialize)]
pub struct UpdateGlobalOpenTrackingRequest {
    pub email_open_tracking_enabled: bool,
}

#[derive(Debug, Clone, Deserialize)]
pub struct UpdateGlobalPixelBlockingRequest {
    pub email_tracking_pixel_blocking_enabled: bool,
}

#[tracing::instrument(skip(ctx, link))]
pub async fn get_global_handler(
    State(ctx): State<ApiContext>,
    link: Extension<Link>,
) -> Result<Json<GlobalExtensionSettingsResponse>, ReadReceiptsError> {
    let settings = email_db_client::read_receipts::fetch_global_extension_settings(
        &ctx.db,
        link.macro_id.as_ref(),
    )
    .await?;
    Ok(Json(GlobalExtensionSettingsResponse {
        email_open_tracking_enabled: settings.email_open_tracking_enabled,
        email_tracking_pixel_blocking_enabled: settings.email_tracking_pixel_blocking_enabled,
    }))
}

#[tracing::instrument(skip(ctx, link, request))]
pub async fn patch_global_open_tracking_handler(
    State(ctx): State<ApiContext>,
    link: Extension<Link>,
    Json(request): Json<UpdateGlobalOpenTrackingRequest>,
) -> Result<Json<GlobalExtensionSettingsResponse>, ReadReceiptsError> {
    let settings = email_db_client::read_receipts::set_global_open_tracking_enabled(
        &ctx.db,
        link.macro_id.as_ref(),
        request.email_open_tracking_enabled,
    )
    .await?;
    Ok(Json(GlobalExtensionSettingsResponse {
        email_open_tracking_enabled: settings.email_open_tracking_enabled,
        email_tracking_pixel_blocking_enabled: settings.email_tracking_pixel_blocking_enabled,
    }))
}

#[tracing::instrument(skip(ctx, link, request))]
pub async fn patch_global_pixel_blocking_handler(
    State(ctx): State<ApiContext>,
    link: Extension<Link>,
    Json(request): Json<UpdateGlobalPixelBlockingRequest>,
) -> Result<Json<GlobalExtensionSettingsResponse>, ReadReceiptsError> {
    let settings = email_db_client::read_receipts::set_global_pixel_blocking_enabled(
        &ctx.db,
        link.macro_id.as_ref(),
        request.email_tracking_pixel_blocking_enabled,
    )
    .await?;
    Ok(Json(GlobalExtensionSettingsResponse {
        email_open_tracking_enabled: settings.email_open_tracking_enabled,
        email_tracking_pixel_blocking_enabled: settings.email_tracking_pixel_blocking_enabled,
    }))
}
