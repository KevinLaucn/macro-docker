//! Read-receipt status query endpoint for sent messages.

use std::collections::HashSet;

use anyhow::Context;
use axum::{
    Json,
    extract::State,
    http::StatusCode,
    response::{IntoResponse, Response},
};
use chrono::{DateTime, Utc};
use macro_authorization::{MacroAuthorizationExtractor, UserOrInternal};
use serde::Serialize;
use sqlx::types::Uuid;

use crate::api::context::{ApiContext, AuthorizationService};

#[cfg(test)]
mod test;

#[derive(Debug, Clone, sqlx::FromRow, Serialize)]
pub struct ReadReceiptStatus {
    pub message_id: Uuid,
    pub first_opened_at: Option<DateTime<Utc>>,
    pub last_opened_at: Option<DateTime<Utc>>,
    pub open_count: i32,
}

#[derive(Debug, Clone, Serialize)]
pub struct ReadReceiptStatusesResponse {
    pub statuses: Vec<ReadReceiptStatus>,
}

#[derive(Debug, Clone, sqlx::FromRow, Serialize)]
pub struct ThreadReadReceiptStatus {
    pub thread_id: Uuid,
    pub latest_sent_message_id: Uuid,
    pub latest_message_id: Uuid,
    #[serde(default)]
    pub is_last_message_sent: bool,
    pub is_opened: bool,
    pub open_count: i32,
    pub first_opened_at: Option<DateTime<Utc>>,
    pub last_opened_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ThreadReadReceiptStatusesResponse {
    pub statuses: Vec<ThreadReadReceiptStatus>,
}

pub const MAX_BATCH_SIZE: usize = 200;

#[derive(Debug, thiserror::Error)]
pub enum ReadReceiptStatusError {
    #[error("Batch size {0} exceeds maximum allowed size of {1}")]
    BatchTooLarge(usize, usize),
    #[error("Database query error")]
    Query(#[from] anyhow::Error),
}

impl IntoResponse for ReadReceiptStatusError {
    fn into_response(self) -> Response {
        match self {
            Self::BatchTooLarge(..) => (StatusCode::BAD_REQUEST, self.to_string()).into_response(),
            Self::Query(_) => {
                tracing::error!(error = ?self, "read receipt status query failed");
                (StatusCode::INTERNAL_SERVER_ERROR, self.to_string()).into_response()
            }
        }
    }
}

#[tracing::instrument(skip(ctx, authorization, ids), fields(user_id = authorization.authorization.user.user_context.user_id))]
pub async fn batch_handler(
    State(ctx): State<ApiContext>,
    authorization: MacroAuthorizationExtractor<AuthorizationService, UserOrInternal>,
    Json(ids): Json<Vec<Uuid>>,
) -> Result<Json<ReadReceiptStatusesResponse>, ReadReceiptStatusError> {
    if ids.len() > MAX_BATCH_SIZE {
        return Err(ReadReceiptStatusError::BatchTooLarge(
            ids.len(),
            MAX_BATCH_SIZE,
        ));
    }

    if ids.is_empty() {
        return Ok(Json(ReadReceiptStatusesResponse {
            statuses: Vec::new(),
        }));
    }

    let link_ids: HashSet<Uuid> = email_db_client::links::get::fetch_inboxes_for_macro_id(
        &ctx.db,
        &authorization.authorization.user.user_context.user_id,
    )
    .await
    .context("unable to fetch inboxes for user")?
    .into_iter()
    .map(|l| l.id)
    .collect();

    if link_ids.is_empty() {
        return Ok(Json(ReadReceiptStatusesResponse {
            statuses: Vec::new(),
        }));
    }

    let link_id_vec: Vec<Uuid> = link_ids.into_iter().collect();

    let statuses = sqlx::query_as::<_, ReadReceiptStatus>(
        r#"
        SELECT
            id AS message_id,
            first_opened_at,
            last_opened_at,
            open_count
        FROM email_messages
        WHERE id = ANY($1)
          AND link_id = ANY($2)
          AND is_sent = true
          AND open_tracking_token IS NOT NULL
        "#,
    )
    .bind(&ids)
    .bind(&link_id_vec)
    .fetch_all(&ctx.db)
    .await
    .context("unable to fetch read receipt statuses")?;

    Ok(Json(ReadReceiptStatusesResponse { statuses }))
}

#[tracing::instrument(skip(ctx, authorization, ids), fields(user_id = authorization.authorization.user.user_context.user_id))]
pub async fn thread_batch_handler(
    State(ctx): State<ApiContext>,
    authorization: MacroAuthorizationExtractor<AuthorizationService, UserOrInternal>,
    Json(ids): Json<Vec<Uuid>>,
) -> Result<Json<ThreadReadReceiptStatusesResponse>, ReadReceiptStatusError> {
    if ids.len() > MAX_BATCH_SIZE {
        return Err(ReadReceiptStatusError::BatchTooLarge(
            ids.len(),
            MAX_BATCH_SIZE,
        ));
    }

    if ids.is_empty() {
        return Ok(Json(ThreadReadReceiptStatusesResponse {
            statuses: Vec::new(),
        }));
    }

    let link_ids: HashSet<Uuid> = email_db_client::links::get::fetch_inboxes_for_macro_id(
        &ctx.db,
        &authorization.authorization.user.user_context.user_id,
    )
    .await
    .context("unable to fetch inboxes for user")?
    .into_iter()
    .map(|l| l.id)
    .collect();

    if link_ids.is_empty() {
        return Ok(Json(ThreadReadReceiptStatusesResponse {
            statuses: Vec::new(),
        }));
    }

    let link_id_vec: Vec<Uuid> = link_ids.into_iter().collect();

    let statuses = sqlx::query_as::<_, ThreadReadReceiptStatus>(
        r#"
        SELECT DISTINCT ON (m.thread_id)
            m.thread_id,
            m.id AS latest_sent_message_id,
            m.id AS latest_message_id,
            true AS is_last_message_sent,
            (COALESCE(m.open_count, 0) > 0 AND m.open_tracking_token IS NOT NULL) AS is_opened,
            COALESCE(m.open_count, 0) AS open_count,
            m.first_opened_at,
            m.last_opened_at
        FROM email_messages m
        WHERE m.thread_id = ANY($1)
          AND m.link_id = ANY($2)
          AND m.is_sent = true
          AND m.is_draft = false
        ORDER BY m.thread_id, COALESCE(m.internal_date_ts, m.sent_at, m.created_at) DESC, m.id DESC
        "#,
    )
    .bind(&ids)
    .bind(&link_id_vec)
    .fetch_all(&ctx.db)
    .await
    .context("unable to fetch thread read receipt statuses")?;

    Ok(Json(ThreadReadReceiptStatusesResponse { statuses }))
}
