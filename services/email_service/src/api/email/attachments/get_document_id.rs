use crate::api::context::{ApiContext, AuthorizationService};
use crate::api::email::drafts::attachment_error::AttachmentApiError;
use axum::{
    Json,
    extract::{Path, State},
};
use email::domain::draft_attachments::AttachmentError;
use macro_authorization::{MacroAuthorizationExtractor, UserOrInternal};
use model::response::ErrorResponse;
use std::time::Duration;
use utoipa::ToSchema;
use uuid::Uuid;

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
#[tracing::instrument(skip(ctx, authorization), err)]
pub async fn handler(
    State(ctx): State<ApiContext>,
    authorization: MacroAuthorizationExtractor<AuthorizationService, UserOrInternal>,
    Path(attachment_id): Path<Uuid>,
) -> Result<Json<GetAttachmentDocumentIDResponse>, AttachmentApiError> {
    let actor = &authorization.authorization.user.macro_user_id;
    let _ = ctx.attachment_reads.authorize(actor, attachment_id).await?;

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
        .map_err(|_| AttachmentApiError(AttachmentError::Infrastructure))?;

    // Re-check after acquiring lock — another request may have completed the upload
    if let Some(document_id) = verify_and_get_cached_document_id(&ctx, attachment_id).await? {
        return Ok(Json(GetAttachmentDocumentIDResponse {
            attachment_id,
            document_id,
        }));
    }

    let document_id = ctx
        .attachment_reads
        .document(actor, attachment_id)
        .await?;
    Ok(Json(GetAttachmentDocumentIDResponse {
        attachment_id,
        document_id,
    }))
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
) -> Result<Option<String>, AttachmentApiError> {
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
    .map_err(|_| AttachmentApiError(AttachmentError::Infrastructure))?;

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
