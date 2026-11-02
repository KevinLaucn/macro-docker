use crate::api::context::{ApiContext, AuthorizationService};
use crate::api::email::drafts::attachment_error::AttachmentApiError;
use axum::{
    Json,
    extract::{Path, State},
    http::StatusCode,
    response::{IntoResponse, Response},
};
use macro_authorization::{MacroAuthorizationExtractor, UserOrInternal};
use model::response::ErrorResponse;
use models_email::service::attachment;
use utoipa::ToSchema;
use uuid::Uuid;

/// The response returned from the get attachment endpoint
#[derive(Debug, serde::Serialize, serde::Deserialize, ToSchema)]
pub struct GetAttachmentResponse {
    pub attachment: attachment::Attachment,
}

/// Get an attachment by ID.
#[utoipa::path(
    get,
    tag = "Attachments",
    path = "/email/attachments/{id}",
    operation_id = "get_attachment",
    params(
        ("id" = Uuid, Path, description = "Attachment ID."),
    ),
    responses(
            (status = 200, body=GetAttachmentResponse),
            (status = 400, body=ErrorResponse),
            (status = 401, body=ErrorResponse),
            (status = 403, body=ErrorResponse),
            (status = 404, body=ErrorResponse),
            (status = 409, body=ErrorResponse),
            (status = 429, body=ErrorResponse),
            (status = 500, body=ErrorResponse),
    )
)]
#[tracing::instrument(skip(ctx, authorization), err)]
pub async fn handler(
    State(ctx): State<ApiContext>,
    authorization: MacroAuthorizationExtractor<AuthorizationService, UserOrInternal>,
    Path(id): Path<Uuid>,
) -> Result<Json<GetAttachmentResponse>, AttachmentApiError> {
    let attachment = ctx
        .attachment_reads
        .download(&authorization.authorization.user.macro_user_id, id)
        .await?;
    Ok(Json(GetAttachmentResponse { attachment }))
}

/// Download an attachment directly via Gmail API streaming/bytes, bypassing DSS and S3.
#[utoipa::path(
    get,
    tag = "Attachments",
    path = "/email/attachments/{id}/download",
    operation_id = "download_attachment",
    params(
        ("id" = Uuid, Path, description = "Attachment ID."),
    ),
    responses(
        (status = 200, description = "Attachment binary data"),
        (status = 400, body = ErrorResponse),
        (status = 401, body = ErrorResponse),
        (status = 403, body = ErrorResponse),
        (status = 404, body = ErrorResponse),
        (status = 500, body = ErrorResponse),
    )
)]
#[tracing::instrument(skip(ctx, authorization), fields(user_id=authorization.authorization.user.user_context.user_id, fusionauth_user_id=authorization.authorization.user.user_context.fusion_user_id))]
pub async fn download_handler(
    State(ctx): State<ApiContext>,
    authorization: MacroAuthorizationExtractor<AuthorizationService, UserOrInternal>,
    Path(attachment_id): Path<Uuid>,
) -> Result<Response, Response> {
    let links = email_db_client::links::get::fetch_inboxes_for_macro_id(
        &ctx.db,
        &authorization.authorization.user.user_context.user_id,
    )
    .await
    .map_err(|e| {
        tracing::warn!(error=?e, "error fetching links");
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                message: "error fetching attachment".into(),
            }),
        )
            .into_response()
    })?;

    let mut owned = None;
    for link in links {
        if let Some((db_attachment, message_provider_id)) =
            email_db_client::attachments::provider::fetch_attachment_by_id(
                &ctx.db,
                attachment_id,
                link.id,
            )
            .await
            .map_err(|e| {
                tracing::warn!(error=?e, "error fetching attachment from db");
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(ErrorResponse {
                        message: "error fetching attachment".into(),
                    }),
                )
                    .into_response()
            })?
        {
            owned = Some((db_attachment, message_provider_id, link));
            break;
        }
    }

    let (db_attachment, message_provider_id, link) = owned.ok_or_else(|| {
        tracing::warn!("attachment with id {} not found for caller", attachment_id);
        (
            StatusCode::NOT_FOUND,
            Json(ErrorResponse {
                message: "attachment does not exist".into(),
            }),
        )
            .into_response()
    })?;

    let provider_attachment_id = db_attachment.provider_id.as_ref().ok_or_else(|| {
        tracing::warn!(attachment_id=%attachment_id, "attachment is missing a provider_id");
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                message: "attachment is missing provider_id".into(),
            }),
        )
            .into_response()
    })?;

    let attachment_data = ctx
        .email_api
        .get_attachment(link.id, &message_provider_id, provider_attachment_id)
        .await
        .map_err(|e| {
            tracing::warn!(error=?e, "error fetching attachment from email provider");
            (
                crate::api::email::provider_error::provider_error_status(&e),
                crate::api::email::provider_error::provider_error_headers(&e),
                Json(ErrorResponse {
                    message: "error fetching attachment from provider".into(),
                }),
            )
                .into_response()
        })?;

    let mime = db_attachment
        .mime_type
        .unwrap_or_else(|| "application/octet-stream".to_string());
    let filename = db_attachment
        .filename
        .unwrap_or_else(|| "attachment".to_string());
    let disposition = format!("attachment; filename=\"{}\"", filename.replace('"', "\\\""));

    let response = axum::response::Response::builder()
        .status(StatusCode::OK)
        .header(axum::http::header::CONTENT_TYPE, mime)
        .header(axum::http::header::CONTENT_DISPOSITION, disposition)
        .header(
            axum::http::header::CONTENT_LENGTH,
            attachment_data.len().to_string(),
        )
        .body(axum::body::Body::from(attachment_data))
        .map_err(|e| {
            tracing::error!(error=?e, "failed to build attachment download response");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    message: "failed to build attachment response".into(),
                }),
            )
                .into_response()
        })?;

    Ok(response)
}
