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

#[derive(Debug, thiserror::Error)]
pub enum ReadReceiptStatusError {
    #[error("Database query error")]
    Query(#[from] anyhow::Error),
}

impl IntoResponse for ReadReceiptStatusError {
    fn into_response(self) -> Response {
        tracing::error!(error = ?self, "read receipt status query failed");
        (StatusCode::INTERNAL_SERVER_ERROR, self.to_string()).into_response()
    }
}

#[tracing::instrument(skip(ctx, authorization, ids), fields(user_id = authorization.authorization.user.user_context.user_id))]
pub async fn batch_handler(
    State(ctx): State<ApiContext>,
    authorization: MacroAuthorizationExtractor<AuthorizationService, UserOrInternal>,
    Json(ids): Json<Vec<Uuid>>,
) -> Result<Json<ReadReceiptStatusesResponse>, ReadReceiptStatusError> {
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
