use crate::api::context::ApiContext;
use crate::util::upload_attachment::{
    UploadAttachmentContext, UploadAttachmentError, upload_attachment,
};
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::{Extension, Json};
use entity_access::domain::ports::EntityAccessService;
use macro_user_id::user_id::MacroUserIdStr;
use model::response::ErrorResponse;
use model_entity::EntityType;
use models_email::db::address::EmailRecipientType;
use models_email::email::service::link::Link;
use models_email::service::attachment::{AttachmentUploadArgs, AttachmentUploadDestination};
use std::time::Duration;
use strum_macros::AsRefStr;
use thiserror::Error;
use utoipa::ToSchema;
use uuid::Uuid;

#[derive(Debug, Error, AsRefStr)]
pub enum GetAttachmentDocumentIdError {
    #[error("Attachment not found")]
    AttachmentNotFound,

    #[error("Access denied")]
    AccessDenied,

    #[error("Database error occurred")]
    DatabaseError(anyhow::Error),

    #[error("Failed to upload attachment: {0}")]
    UploadError(UploadAttachmentError),
}

impl IntoResponse for GetAttachmentDocumentIdError {
    fn into_response(self) -> Response {
        let status_code = match &self {
            GetAttachmentDocumentIdError::AttachmentNotFound => StatusCode::NOT_FOUND,
            GetAttachmentDocumentIdError::AccessDenied => StatusCode::FORBIDDEN,
            GetAttachmentDocumentIdError::UploadError(error) => upload_attachment_status(error),
            GetAttachmentDocumentIdError::DatabaseError(_) => StatusCode::INTERNAL_SERVER_ERROR,
        };

        (status_code, self.to_string()).into_response()
    }
}

fn upload_attachment_status(error: &UploadAttachmentError) -> StatusCode {
    match error {
        UploadAttachmentError::RateLimited => StatusCode::TOO_MANY_REQUESTS,
        // Provider failures keep their meaning (401/403/404/409/429)
        // instead of collapsing to 500.
        UploadAttachmentError::GmailFetchFailed(provider_error) => {
            crate::api::email::provider_error::provider_error_status(provider_error)
        }
        UploadAttachmentError::DssCreateFailed(error) if is_dss_unauthorized(error) => {
            StatusCode::BAD_GATEWAY
        }
        _ => StatusCode::INTERNAL_SERVER_ERROR,
    }
}

fn is_dss_unauthorized(error: &str) -> bool {
    error.contains("HTTP 401") || error.contains("401 Unauthorized")
}

/// The response returned from the get attachment endpoint
#[derive(Debug, serde::Serialize, serde::Deserialize, ToSchema)]
pub struct GetAttachmentDocumentIDResponse {
    pub attachment_id: Uuid,
    pub document_id: String,
}

/// Get the Macro document id for an email attachment, uploading it if it doesn't already exist.
#[utoipa::path(
    get,
    tag = "Attachments",
    path = "/email/attachments/{id}/document_id",
    operation_id = "get_attachment_document_id",
    params(
        ("id" = Uuid, Path, description = "Attachment ID."),
    ),
    responses(
            (status = 200, body = GetAttachmentDocumentIDResponse),
            (status = 400, body = ErrorResponse),
            (status = 401, body = ErrorResponse),
            (status = 404, body = ErrorResponse),
            (status = 500, body = ErrorResponse),
    )
)]
#[tracing::instrument(skip(ctx), err)]
pub async fn handler(
    State(ctx): State<ApiContext>,
    link: Extension<Link>,
    Path(attachment_id): Path<Uuid>,
) -> Result<Json<GetAttachmentDocumentIDResponse>, GetAttachmentDocumentIdError> {
    // PRIVATE-HOOK: self_host_resilience:verify_attachment_s3_presence
    if let Some(document_id) = verify_and_get_cached_document_id(&ctx, attachment_id).await? {
        return Ok(Json(GetAttachmentDocumentIDResponse {
            attachment_id,
            document_id,
        }));
    }

    // Acquire a distributed lock to prevent duplicate uploads of the same attachment
    let lock_key = format!("attachment_upload:{}", attachment_id);
    let _lock = ctx
        .redis_client
        .acquire_lock(&lock_key, Duration::from_secs(60), Duration::from_secs(30))
        .await
        .map_err(|e| GetAttachmentDocumentIdError::DatabaseError(e.into()))?;

    // Re-check after acquiring lock — another request may have completed the upload
    if let Some(document_id) = verify_and_get_cached_document_id(&ctx, attachment_id).await? {
        return Ok(Json(GetAttachmentDocumentIDResponse {
            attachment_id,
            document_id,
        }));
    }

    // Verify access and resolve the owner's link.
    let owner_link = verify_access_and_get_owner(&ctx, &link, attachment_id).await?;

    // Prepare and execute upload to owner's macro account
    let upload_args = prepare_upload_args(&ctx, attachment_id).await?;
    let document_id = upload_and_get_document_id(&ctx, &owner_link, &upload_args).await?;

    // _lock released on drop

    Ok(Json(GetAttachmentDocumentIDResponse {
        attachment_id,
        document_id,
    }))
}

/// Verifies access and returns the owner's link.
/// If the user is the owner, returns their link. Otherwise, verifies shared access and resolves
/// the owner's link.
async fn verify_access_and_get_owner(
    ctx: &ApiContext,
    link: &Link,
    attachment_id: Uuid,
) -> Result<Link, GetAttachmentDocumentIdError> {
    let (thread_id, owner_link_id) =
        email_db_client::attachments::provider::get_thread_id_for_attachment(
            &ctx.db,
            attachment_id,
        )
        .await
        .map_err(GetAttachmentDocumentIdError::DatabaseError)?
        .ok_or(GetAttachmentDocumentIdError::AttachmentNotFound)?;

    // User is the owner, use their link directly.
    if owner_link_id == link.id {
        return Ok(link.clone());
    }

    // Verify shared access to the thread
    let user_id = MacroUserIdStr::parse_from_str(link.macro_id.as_ref())
        .map_err(|e| GetAttachmentDocumentIdError::DatabaseError(anyhow::anyhow!(e)))?;
    ctx.entity_access_service
        .get_access_level(
            Some(&user_id),
            &thread_id.to_string(),
            EntityType::EmailThread,
        )
        .await
        .map_err(|e| GetAttachmentDocumentIdError::DatabaseError(anyhow::anyhow!(e)))?
        .ok_or(GetAttachmentDocumentIdError::AccessDenied)?;

    email_db_client::links::get::fetch_link_by_id(&ctx.db, owner_link_id)
        .await
        .map_err(GetAttachmentDocumentIdError::DatabaseError)?
        .ok_or(GetAttachmentDocumentIdError::AttachmentNotFound)
}

/// Prepares the upload arguments for an attachment.
async fn prepare_upload_args(
    ctx: &ApiContext,
    attachment_id: Uuid,
) -> Result<AttachmentUploadArgs, GetAttachmentDocumentIdError> {
    let attachment_metadata =
        email_db_client::attachments::provider::upload::fetch_attachment_upload_metadata_by_id(
            &ctx.db,
            attachment_id,
        )
        .await
        .map_err(GetAttachmentDocumentIdError::DatabaseError)?
        .ok_or(GetAttachmentDocumentIdError::AttachmentNotFound)?;

    let recipients = email_db_client::contacts::get::fetch_db_recipients(
        &ctx.db,
        attachment_metadata.message_db_id,
    )
    .await
    .map_err(GetAttachmentDocumentIdError::DatabaseError)?;

    let recipient_emails: Vec<String> = recipients
        .iter()
        .filter(|(_, recipient_type)| *recipient_type == EmailRecipientType::To)
        .filter_map(|(contact, _)| contact.email_address.clone())
        .collect();

    Ok(AttachmentUploadArgs {
        attachment_metadata,
        recipient_emails,
        backfill: false,
        // Frontend will soon use SFS URLs for image/video attachments directly instead of DSS
        // Until this transition is complete, we continue uploading all attachments to DSS
        upload_destination: AttachmentUploadDestination::Dss,
    })
}

/// Uploads the attachment and returns the document ID.
async fn upload_and_get_document_id(
    ctx: &ApiContext,
    link: &Link,
    upload_args: &AttachmentUploadArgs,
) -> Result<String, GetAttachmentDocumentIdError> {
    let ctx_upload = UploadAttachmentContext {
        db: &ctx.db,
        email_api: &ctx.email_api,
        dss_client: &ctx.dss_client,
        sfs_client: &ctx.sfs_client,
        system_properties_service: &ctx.system_properties_service,
        link,
    };

    upload_attachment(ctx_upload, upload_args)
        .await
        .map_err(GetAttachmentDocumentIdError::UploadError)
}

#[derive(sqlx::FromRow)]
struct CachedAttachmentDocRow {
    document_id: String,
    owner: String,
    version_id: Option<i64>,
}

async fn verify_and_get_cached_document_id(
    ctx: &ApiContext,
    attachment_id: Uuid,
) -> Result<Option<String>, GetAttachmentDocumentIdError> {
    let row: Option<CachedAttachmentDocRow> = sqlx::query_as(
        r#"
        SELECT de.document_id, d.owner, di.id as version_id
        FROM document_email de
        INNER JOIN "Document" d ON de.document_id = d.id
        LEFT JOIN "DocumentInstance" di ON di."documentId" = d.id
        WHERE de.email_attachment_id = $1 AND d."deletedAt" IS NULL
        ORDER BY di."createdAt" DESC
        LIMIT 1
        "#,
    )
    .bind(attachment_id)
    .fetch_optional(&ctx.db)
    .await
    .map_err(|e| GetAttachmentDocumentIdError::DatabaseError(e.into()))?;

    let Some(record) = row else {
        return Ok(None);
    };

    let document_id = record.document_id;
    let Some(version_id) = record.version_id else {
        return Ok(Some(document_id));
    };

    let bucket =
        std::env::var("DOCUMENT_STORAGE_BUCKET").unwrap_or_else(|_| "doc-storage".to_string());
    let s3_key = format!("{}/{}/{}", record.owner, document_id, version_id);

    match ctx.s3_client.exists(&bucket, &s3_key).await {
        Ok(true) => Ok(Some(document_id)),
        Ok(false) => {
            tracing::warn!(
                attachment_id = %attachment_id,
                document_id = %document_id,
                s3_key = %s3_key,
                "Attachment document S3 object missing, purging stale mapping to trigger re-upload"
            );
            let _ = sqlx::query(r#"DELETE FROM document_email WHERE email_attachment_id = $1"#)
                .bind(attachment_id)
                .execute(&ctx.db)
                .await;

            let _ = sqlx::query(r#"UPDATE "Document" SET "deletedAt" = NOW() WHERE id = $1"#)
                .bind(&document_id)
                .execute(&ctx.db)
                .await;

            Ok(None)
        }
        Err(e) => {
            tracing::warn!(
                error = ?e,
                attachment_id = %attachment_id,
                document_id = %document_id,
                "Failed to probe S3 object existence, proceeding with cached document_id"
            );
            Ok(Some(document_id))
        }
    }
}
