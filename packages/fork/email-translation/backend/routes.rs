//! Axum routes for email AI translation (`/cognition/email-translation/...`).

use crate::cognition::api::context::{ApiContext, DcsAuthorizationService};
use axum::{
    Json, Router,
    extract::State,
    http::StatusCode,
    response::{IntoResponse, Response},
    routing::post,
};
use futures::stream::{self, StreamExt};
use macro_authorization::{MacroAuthorizationExtractor, UserOrInternal};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use uuid::Uuid;

use super::repo::{PgEmailTranslationStore, TranslationStoreError};
use super::service::{
    EmailTranslationService, MessageTranslationDto, ThreadContentType, ThreadTranslationDto,
    TranslationAction, TranslationServiceError,
};

pub const MAX_MESSAGE_BATCH_SIZE: usize = 50;
pub const MAX_THREAD_BATCH_SIZE: usize = 100;
const MAX_BATCH_CONCURRENCY: usize = 4;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MessagesTranslationRequest {
    pub message_ids: Vec<Uuid>,
    pub target_lang: String,
    #[serde(default)]
    pub action: TranslationAction,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MessagesTranslationResponse {
    pub translations: Vec<MessageTranslationDto>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThreadsTranslationRequest {
    pub thread_ids: Vec<Uuid>,
    #[serde(default)]
    pub content_type: ThreadContentType,
    pub target_lang: String,
    #[serde(default)]
    pub action: TranslationAction,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThreadsTranslationResponse {
    pub translations: Vec<ThreadTranslationDto>,
}

#[derive(Debug, Serialize)]
pub struct TranslationErrorBody {
    pub error: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub code: Option<String>,
}

pub enum TranslationHttpError {
    BadRequest(String),
    Forbidden(String),
    NotFound(String),
    Admission {
        status: StatusCode,
        code: String,
        message: String,
    },
    Internal(String),
}

impl From<TranslationServiceError> for TranslationHttpError {
    fn from(err: TranslationServiceError) -> Self {
        match err {
            TranslationServiceError::InvalidInput(msg) => Self::BadRequest(msg),
            TranslationServiceError::Store(TranslationStoreError::Forbidden) => {
                Self::Forbidden("User does not have permission to access this email".to_owned())
            }
            TranslationServiceError::Store(TranslationStoreError::NotFound) => {
                Self::NotFound("Email or thread not found".to_owned())
            }
            TranslationServiceError::Store(TranslationStoreError::Database(e)) => {
                tracing::error!(error = ?e, "email translation database error");
                Self::Internal("Failed to persist or load email translation".to_owned())
            }
            TranslationServiceError::Admission {
                status,
                code,
                message,
            } => Self::Admission {
                status,
                code,
                message,
            },
            TranslationServiceError::AiFailed(msg) => Self::Internal(msg),
        }
    }
}

impl IntoResponse for TranslationHttpError {
    fn into_response(self) -> Response {
        let (status, body) = match self {
            Self::BadRequest(error) => (StatusCode::BAD_REQUEST, TranslationErrorBody { error, code: None }),
            Self::Forbidden(error) => (StatusCode::FORBIDDEN, TranslationErrorBody { error, code: Some("forbidden".to_owned()) }),
            Self::NotFound(error) => (StatusCode::NOT_FOUND, TranslationErrorBody { error, code: Some("not_found".to_owned()) }),
            Self::Admission {
                status,
                code,
                message,
            } => (
                status,
                TranslationErrorBody {
                    error: message,
                    code: Some(code),
                },
            ),
            Self::Internal(error) => (
                StatusCode::INTERNAL_SERVER_ERROR,
                TranslationErrorBody { error, code: None },
            ),
        };
        (status, Json(body)).into_response()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TranslationConfigResponse {
    pub model_id: String,
    pub origin: String,
}

pub fn router() -> Router<ApiContext> {
    Router::new()
        .route("/messages", post(messages_handler))
        .route("/threads", post(threads_handler))
        .route("/config", axum::routing::get(config_handler))
}

pub async fn config_handler() -> Result<Json<TranslationConfigResponse>, TranslationHttpError> {
    let res = super::service::resolve_translation_model()?;
    Ok(Json(TranslationConfigResponse {
        model_id: res.model_id,
        origin: res.origin.to_string(),
    }))
}

#[tracing::instrument(
    skip_all,
    fields(
        user_id = %user.authorization.user.macro_user_id,
        count = req.message_ids.len(),
        target_lang = %req.target_lang,
        action = ?req.action
    )
)]
pub async fn messages_handler(
    State(ctx): State<ApiContext>,
    user: MacroAuthorizationExtractor<DcsAuthorizationService, UserOrInternal>,
    Json(req): Json<MessagesTranslationRequest>,
) -> Result<Json<MessagesTranslationResponse>, TranslationHttpError> {
    if req.message_ids.len() > MAX_MESSAGE_BATCH_SIZE {
        return Err(TranslationHttpError::BadRequest(format!(
            "Batch size {} exceeds maximum of {}",
            req.message_ids.len(),
            MAX_MESSAGE_BATCH_SIZE
        )));
    }
    let target_lang = EmailTranslationService::<PgEmailTranslationStore>::normalize_target_lang(
        &req.target_lang,
    )?;
    if req.message_ids.is_empty() {
        return Ok(Json(MessagesTranslationResponse {
            translations: Vec::new(),
        }));
    }

    let store = Arc::new(PgEmailTranslationStore::new(
        ctx.db.clone(),
        ctx.entity_access_service.clone(),
        ctx.email_service.clone(),
    ));
    let service = EmailTranslationService::new(
        store,
        ctx.tool_free_completions.clone(),
        ctx.ai_admission.clone(),
    );

    let user_id = user.authorization.user.macro_user_id.clone();
    let org_id = user
        .authorization
        .user
        .user_context
        .organization_id
        .map(i64::from);
    let action = req.action;
    let is_single = req.message_ids.len() == 1;

    let results: Vec<Result<MessageTranslationDto, (Uuid, TranslationServiceError)>> =
        stream::iter(req.message_ids)
            .map(|message_id| {
                let svc = service.clone();
                let uid = user_id.clone();
                let lang = target_lang.clone();
                async move {
                    svc.process_message(&uid, org_id, message_id, &lang, action)
                        .await
                        .map_err(|e| (message_id, e))
                }
            })
            .buffered(MAX_BATCH_CONCURRENCY)
            .collect()
            .await;

    let mut translations = Vec::with_capacity(results.len());
    let mut forbidden_count = 0usize;
    let total = results.len();

    for res in results {
        match res {
            Ok(dto) => translations.push(dto),
            Err((
                _,
                err @ (TranslationServiceError::Store(TranslationStoreError::Forbidden)
                | TranslationServiceError::Store(TranslationStoreError::NotFound)
                | TranslationServiceError::Store(TranslationStoreError::Database(_))
                | TranslationServiceError::Admission { .. }),
            )) if is_single => {
                return Err(TranslationHttpError::from(err));
            }
            Err((_, TranslationServiceError::Store(TranslationStoreError::Forbidden))) => {
                forbidden_count += 1;
            }
            Err((_, err @ TranslationServiceError::Store(TranslationStoreError::Database(_)))) => {
                return Err(TranslationHttpError::from(err));
            }
            Err((message_id, err)) => {
                translations.push(MessageTranslationDto {
                    message_id,
                    thread_id: Uuid::nil(),
                    target_lang: target_lang.clone(),
                    source_hash: String::new(),
                    status: "error".to_owned(),
                    saved: false,
                    from_cache: false,
                    model: None,
                    translated_html: None,
                    translated_replyless_html: None,
                    translated_text: None,
                    translated_subject: None,
                    translated_snippet: None,
                    error: Some(err.to_string()),
                });
            }
        }
    }

    if forbidden_count > 0 && forbidden_count == total {
        return Err(TranslationHttpError::Forbidden(
            "User does not have permission to access the requested email(s)".to_owned(),
        ));
    }

    Ok(Json(MessagesTranslationResponse { translations }))
}

#[tracing::instrument(
    skip_all,
    fields(
        user_id = %user.authorization.user.macro_user_id,
        count = req.thread_ids.len(),
        content_type = ?req.content_type,
        target_lang = %req.target_lang,
        action = ?req.action
    )
)]
pub async fn threads_handler(
    State(ctx): State<ApiContext>,
    user: MacroAuthorizationExtractor<DcsAuthorizationService, UserOrInternal>,
    Json(req): Json<ThreadsTranslationRequest>,
) -> Result<Json<ThreadsTranslationResponse>, TranslationHttpError> {
    if req.thread_ids.len() > MAX_THREAD_BATCH_SIZE {
        return Err(TranslationHttpError::BadRequest(format!(
            "Batch size {} exceeds maximum of {}",
            req.thread_ids.len(),
            MAX_THREAD_BATCH_SIZE
        )));
    }
    let target_lang = EmailTranslationService::<PgEmailTranslationStore>::normalize_target_lang(
        &req.target_lang,
    )?;
    if req.thread_ids.is_empty() {
        return Ok(Json(ThreadsTranslationResponse {
            translations: Vec::new(),
        }));
    }

    let store = Arc::new(PgEmailTranslationStore::new(
        ctx.db.clone(),
        ctx.entity_access_service.clone(),
        ctx.email_service.clone(),
    ));
    let service = EmailTranslationService::new(
        store,
        ctx.tool_free_completions.clone(),
        ctx.ai_admission.clone(),
    );

    let user_id = user.authorization.user.macro_user_id.clone();
    let org_id = user
        .authorization
        .user
        .user_context
        .organization_id
        .map(i64::from);
    let content_type = req.content_type;
    let action = req.action;
    let is_single = req.thread_ids.len() == 1;

    let results: Vec<Result<ThreadTranslationDto, (Uuid, TranslationServiceError)>> =
        stream::iter(req.thread_ids)
            .map(|thread_id| {
                let svc = service.clone();
                let uid = user_id.clone();
                let lang = target_lang.clone();
                async move {
                    svc.process_thread(&uid, org_id, thread_id, content_type, &lang, action)
                        .await
                        .map_err(|e| (thread_id, e))
                }
            })
            .buffered(MAX_BATCH_CONCURRENCY)
            .collect()
            .await;

    let mut translations = Vec::with_capacity(results.len());
    let mut forbidden_count = 0usize;
    let total = results.len();

    for res in results {
        match res {
            Ok(dto) => translations.push(dto),
            Err((
                _,
                err @ (TranslationServiceError::Store(TranslationStoreError::Forbidden)
                | TranslationServiceError::Store(TranslationStoreError::NotFound)
                | TranslationServiceError::Store(TranslationStoreError::Database(_))
                | TranslationServiceError::Admission { .. }),
            )) if is_single => {
                return Err(TranslationHttpError::from(err));
            }
            Err((_, TranslationServiceError::Store(TranslationStoreError::Forbidden))) => {
                forbidden_count += 1;
            }
            Err((_, err @ TranslationServiceError::Store(TranslationStoreError::Database(_)))) => {
                return Err(TranslationHttpError::from(err));
            }
            Err((thread_id, err)) => {
                translations.push(ThreadTranslationDto {
                    thread_id,
                    content_type: content_type.as_str().to_owned(),
                    target_lang: target_lang.clone(),
                    source_hash: String::new(),
                    status: "error".to_owned(),
                    saved: false,
                    from_cache: false,
                    model: None,
                    translated_subject: None,
                    translated_snippet: None,
                    error: Some(err.to_string()),
                });
            }
        }
    }

    if forbidden_count > 0 && forbidden_count == total {
        return Err(TranslationHttpError::Forbidden(
            "User does not have permission to access the requested thread(s)".to_owned(),
        ));
    }

    Ok(Json(ThreadsTranslationResponse { translations }))
}
