//! PostgreSQL persistence and permission-verified source loading for email translations.

use crate::cognition::api::context::DcsEntityAccessService;
use ai_tools::ToolEmailService;
use async_trait::async_trait;
use chrono::{DateTime, Utc};
use email::domain::ports::EmailService as _;
use entity_access::domain::models::{
    AccessLevel, EntityPermission, EntityType, ViewAccessLevel,
};
use entity_access::domain::ports::EntityAccessService as _;
use macro_user_id::user_id::MacroUserIdStr;
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, PgPool, types::Json};
use std::collections::HashMap;
use std::sync::Arc;
use uuid::Uuid;

#[derive(Debug, thiserror::Error)]
pub enum TranslationStoreError {
    #[error("Email or thread not found")]
    NotFound,
    #[error("User does not have permission to access this email")]
    Forbidden,
    #[error("Database error: {0}")]
    Database(#[from] anyhow::Error),
}

#[derive(Debug, Clone)]
pub struct AuthoritativeEmailMessage {
    pub message_id: Uuid,
    pub thread_id: Uuid,
    pub link_id: Uuid,
    pub is_sent: bool,
    pub is_draft: bool,
    pub subject: Option<String>,
    pub snippet: Option<String>,
    pub body_html_sanitized: Option<String>,
    pub body_replyless: Option<String>,
    pub body_text: Option<String>,
    pub body_macro: Option<String>,
}

#[derive(Debug, Clone)]
pub struct AuthoritativeEmailThreadSummary {
    pub thread_id: Uuid,
    pub link_id: Uuid,
    pub latest_message_id: Option<Uuid>,
    pub subject: String,
    pub snippet: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PersistedTranslationRow {
    pub id: Uuid,
    pub owner_scope: String,
    pub link_id: Uuid,
    pub thread_id: Uuid,
    pub message_id: Option<Uuid>,
    pub target_id: String,
    pub content_type: String,
    pub target_lang: String,
    pub source_hash: String,
    pub status: String,
    pub translated_html: Option<String>,
    pub translated_replyless_html: Option<String>,
    pub translated_text: Option<String>,
    pub translated_subject: Option<String>,
    pub translated_snippet: Option<String>,
    pub segments_json: HashMap<String, String>,
    pub model: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone)]
pub struct UpsertTranslationInput {
    pub owner_scope: String,
    pub link_id: Uuid,
    pub thread_id: Uuid,
    pub message_id: Option<Uuid>,
    pub target_id: String,
    pub content_type: String,
    pub target_lang: String,
    pub source_hash: String,
    pub status: String,
    pub translated_html: Option<String>,
    pub translated_replyless_html: Option<String>,
    pub translated_text: Option<String>,
    pub translated_subject: Option<String>,
    pub translated_snippet: Option<String>,
    pub segments_json: HashMap<String, String>,
    pub model: String,
}

#[async_trait]
pub trait EmailTranslationStore: Send + Sync + 'static {
    async fn load_authorized_message(
        &self,
        user_id: &MacroUserIdStr<'static>,
        org_id: Option<i64>,
        message_id: Uuid,
    ) -> Result<AuthoritativeEmailMessage, TranslationStoreError>;

    async fn load_authorized_thread(
        &self,
        user_id: &MacroUserIdStr<'static>,
        org_id: Option<i64>,
        thread_id: Uuid,
    ) -> Result<AuthoritativeEmailThreadSummary, TranslationStoreError>;

    async fn get_translation(
        &self,
        owner_scope: &str,
        content_type: &str,
        target_id: &str,
        target_lang: &str,
        source_hash: &str,
    ) -> Result<Option<PersistedTranslationRow>, TranslationStoreError>;

    async fn upsert_translation(
        &self,
        input: UpsertTranslationInput,
    ) -> Result<PersistedTranslationRow, TranslationStoreError>;
}

#[derive(Debug, FromRow)]
struct DbRawMessageRow {
    id: Uuid,
    thread_id: Uuid,
    link_id: Uuid,
    is_sent: bool,
    is_draft: bool,
    subject: Option<String>,
    snippet: Option<String>,
    body_html_sanitized: Option<String>,
    body_text: Option<String>,
    body_macro: Option<String>,
}

#[derive(Debug, FromRow)]
struct DbTranslationRow {
    id: Uuid,
    owner_scope: String,
    link_id: Uuid,
    thread_id: Uuid,
    message_id: Option<Uuid>,
    target_id: String,
    content_type: String,
    target_lang: String,
    source_hash: String,
    status: String,
    translated_html: Option<String>,
    translated_replyless_html: Option<String>,
    translated_text: Option<String>,
    translated_subject: Option<String>,
    translated_snippet: Option<String>,
    segments_json: Json<HashMap<String, String>>,
    model: String,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
}

impl From<DbTranslationRow> for PersistedTranslationRow {
    fn from(row: DbTranslationRow) -> Self {
        Self {
            id: row.id,
            owner_scope: row.owner_scope,
            link_id: row.link_id,
            thread_id: row.thread_id,
            message_id: row.message_id,
            target_id: row.target_id,
            content_type: row.content_type,
            target_lang: row.target_lang,
            source_hash: row.source_hash,
            status: row.status,
            translated_html: row.translated_html,
            translated_replyless_html: row.translated_replyless_html,
            translated_text: row.translated_text,
            translated_subject: row.translated_subject,
            translated_snippet: row.translated_snippet,
            segments_json: row.segments_json.0,
            model: row.model,
            created_at: row.created_at,
            updated_at: row.updated_at,
        }
    }
}

#[derive(Clone)]
pub struct PgEmailTranslationStore {
    pool: PgPool,
    entity_access_service: Option<Arc<DcsEntityAccessService>>,
    email_service: Option<Arc<ToolEmailService>>,
}

impl PgEmailTranslationStore {
    pub fn new(
        pool: PgPool,
        entity_access_service: Arc<DcsEntityAccessService>,
        email_service: Arc<ToolEmailService>,
    ) -> Self {
        Self {
            pool,
            entity_access_service: Some(entity_access_service),
            email_service: Some(email_service),
        }
    }

    pub fn new_pool_only(pool: PgPool) -> Self {
        Self {
            pool,
            entity_access_service: None,
            email_service: None,
        }
    }

    async fn check_sql_thread_access(
        &self,
        user_id: &str,
        thread_id: Uuid,
    ) -> Result<Option<AccessLevel>, TranslationStoreError> {
        #[derive(FromRow)]
        struct AccessProbe {
            is_inbox_owner: bool,
            has_shared_access: bool,
        }

        let probe = sqlx::query_as::<_, AccessProbe>(
            r#"
            SELECT
                EXISTS (
                    SELECT 1
                    FROM email_links l
                    WHERE l.id = t.link_id
                      AND LOWER(l.macro_id) = LOWER($2)
                ) AS is_inbox_owner,
                EXISTS (
                    SELECT 1
                    FROM entity_access ea
                    WHERE ea.entity_id = t.id
                      AND ea.entity_type = 'email_thread'
                      AND LOWER(ea.source_id) = LOWER($2)
                ) AS has_shared_access
            FROM email_threads t
            WHERE t.id = $1
            "#,
        )
        .bind(thread_id)
        .bind(user_id)
        .fetch_optional(&self.pool)
        .await
        .map_err(|e| TranslationStoreError::Database(e.into()))?;

        let Some(probe) = probe else {
            return Err(TranslationStoreError::NotFound);
        };
        if probe.is_inbox_owner {
            Ok(Some(AccessLevel::Owner))
        } else if probe.has_shared_access {
            Ok(Some(AccessLevel::View))
        } else {
            Ok(None)
        }
    }
}

#[async_trait]
impl EmailTranslationStore for PgEmailTranslationStore {
    async fn load_authorized_message(
        &self,
        user_id: &MacroUserIdStr<'static>,
        org_id: Option<i64>,
        message_id: Uuid,
    ) -> Result<AuthoritativeEmailMessage, TranslationStoreError> {
        let raw_row = sqlx::query_as::<_, DbRawMessageRow>(
            r#"
            SELECT
                id,
                thread_id,
                link_id,
                is_sent,
                is_draft,
                subject,
                snippet,
                body_html_sanitized,
                body_text,
                body_macro
            FROM email_messages
            WHERE id = $1
              AND NOT (is_draft AND COALESCE((mailbox_state->>'provider_missing')::boolean, false))
            "#,
        )
        .bind(message_id)
        .fetch_optional(&self.pool)
        .await
        .map_err(|e| TranslationStoreError::Database(e.into()))?
        .ok_or(TranslationStoreError::NotFound)?;

        if let (Some(access_svc), Some(email_svc)) =
            (&self.entity_access_service, &self.email_service)
        {
            let receipt = match access_svc
                .generate_entity_access_receipt::<ViewAccessLevel>(
                    user_id,
                    org_id,
                    &raw_row.thread_id.to_string(),
                    EntityType::EmailThread,
                )
                .await
            {
                Ok(receipt) => receipt,
                Err(_) => return Err(TranslationStoreError::Forbidden),
            };

            let is_owner = matches!(
                receipt.entity_permission(),
                EntityPermission::AccessLevel {
                    access_level: AccessLevel::Owner
                }
            );
            if raw_row.is_draft && !is_owner {
                return Err(TranslationStoreError::Forbidden);
            }

            if let Ok(Some(thread)) = email_svc.get_thread_with_messages(receipt, 0, 100).await
                && let Some(msg) = thread.messages.into_iter().find(|m| m.db_id == message_id)
            {
                return Ok(AuthoritativeEmailMessage {
                    message_id: msg.db_id,
                    thread_id: msg.thread_db_id,
                    link_id: msg.link_id,
                    is_sent: msg.is_sent,
                    is_draft: msg.is_draft,
                    subject: msg.subject,
                    snippet: msg.snippet,
                    body_html_sanitized: msg.body_html_sanitized,
                    body_replyless: msg.body_replyless,
                    body_text: msg.body_text,
                    body_macro: msg.body_macro,
                });
            }

            return Ok(AuthoritativeEmailMessage {
                message_id: raw_row.id,
                thread_id: raw_row.thread_id,
                link_id: raw_row.link_id,
                is_sent: raw_row.is_sent,
                is_draft: raw_row.is_draft,
                subject: raw_row.subject,
                snippet: raw_row.snippet,
                body_replyless: raw_row.body_html_sanitized.clone(),
                body_html_sanitized: raw_row.body_html_sanitized,
                body_text: raw_row.body_text,
                body_macro: raw_row.body_macro,
            });
        }

        let access = self
            .check_sql_thread_access(user_id.as_ref(), raw_row.thread_id)
            .await?
            .ok_or(TranslationStoreError::Forbidden)?;

        if raw_row.is_draft && access != AccessLevel::Owner {
            return Err(TranslationStoreError::Forbidden);
        }

        Ok(AuthoritativeEmailMessage {
            message_id: raw_row.id,
            thread_id: raw_row.thread_id,
            link_id: raw_row.link_id,
            is_sent: raw_row.is_sent,
            is_draft: raw_row.is_draft,
            subject: raw_row.subject,
            snippet: raw_row.snippet,
            body_replyless: raw_row.body_html_sanitized.clone(),
            body_html_sanitized: raw_row.body_html_sanitized,
            body_text: raw_row.body_text,
            body_macro: raw_row.body_macro,
        })
    }

    async fn load_authorized_thread(
        &self,
        user_id: &MacroUserIdStr<'static>,
        org_id: Option<i64>,
        thread_id: Uuid,
    ) -> Result<AuthoritativeEmailThreadSummary, TranslationStoreError> {
        if let (Some(access_svc), Some(email_svc)) =
            (&self.entity_access_service, &self.email_service)
        {
            let receipt = access_svc
                .generate_entity_access_receipt::<ViewAccessLevel>(
                    user_id,
                    org_id,
                    &thread_id.to_string(),
                    EntityType::EmailThread,
                )
                .await
                .map_err(|_| TranslationStoreError::Forbidden)?;

            let thread = email_svc
                .get_thread_with_messages(receipt, 0, 10)
                .await
                .map_err(|e| TranslationStoreError::Database(e.into()))?
                .ok_or(TranslationStoreError::NotFound)?;

            let latest_msg = thread
                .messages
                .iter()
                .find(|m| !m.is_draft)
                .or_else(|| thread.messages.first());

            let subject = latest_msg
                .and_then(|m| m.subject.clone())
                .or_else(|| thread.messages.iter().find_map(|m| m.subject.clone()))
                .unwrap_or_default();

            let snippet = latest_msg
                .and_then(|m| {
                    m.snippet
                        .clone()
                        .filter(|s| !s.trim().is_empty())
                        .or_else(|| m.body_text.clone())
                })
                .unwrap_or_default();

            return Ok(AuthoritativeEmailThreadSummary {
                thread_id: thread.row.db_id,
                link_id: thread.row.link_id,
                latest_message_id: latest_msg.map(|m| m.db_id),
                subject,
                snippet,
            });
        }

        let access = self
            .check_sql_thread_access(user_id.as_ref(), thread_id)
            .await?
            .ok_or(TranslationStoreError::Forbidden)?;

        let is_owner = access == AccessLevel::Owner;

        #[derive(FromRow)]
        struct ThreadHeaderRow {
            id: Uuid,
            link_id: Uuid,
        }

        let thread_row = sqlx::query_as::<_, ThreadHeaderRow>(
            "SELECT id, link_id FROM email_threads WHERE id = $1",
        )
        .bind(thread_id)
        .fetch_optional(&self.pool)
        .await
        .map_err(|e| TranslationStoreError::Database(e.into()))?
        .ok_or(TranslationStoreError::NotFound)?;

        #[derive(FromRow)]
        struct MsgPreviewRow {
            id: Uuid,
            subject: Option<String>,
            snippet: Option<String>,
            body_text: Option<String>,
        }

        let latest_msg = sqlx::query_as::<_, MsgPreviewRow>(
            r#"
            SELECT id, subject, snippet, body_text
            FROM email_messages
            WHERE thread_id = $1
              AND ($2 OR NOT is_draft)
            ORDER BY COALESCE(internal_date_ts, sent_at, created_at) DESC, id DESC
            LIMIT 1
            "#,
        )
        .bind(thread_id)
        .bind(is_owner)
        .fetch_optional(&self.pool)
        .await
        .map_err(|e| TranslationStoreError::Database(e.into()))?;

        let subject = latest_msg
            .as_ref()
            .and_then(|m| m.subject.clone())
            .unwrap_or_default();
        let snippet = latest_msg
            .as_ref()
            .and_then(|m| {
                m.snippet
                    .clone()
                    .filter(|s| !s.trim().is_empty())
                    .or_else(|| m.body_text.clone())
            })
            .unwrap_or_default();

        Ok(AuthoritativeEmailThreadSummary {
            thread_id: thread_row.id,
            link_id: thread_row.link_id,
            latest_message_id: latest_msg.map(|m| m.id),
            subject,
            snippet,
        })
    }

    async fn get_translation(
        &self,
        owner_scope: &str,
        content_type: &str,
        target_id: &str,
        target_lang: &str,
        source_hash: &str,
    ) -> Result<Option<PersistedTranslationRow>, TranslationStoreError> {
        let row = sqlx::query_as::<_, DbTranslationRow>(
            r#"
            SELECT
                id,
                owner_scope,
                link_id,
                thread_id,
                message_id,
                target_id,
                content_type,
                target_lang,
                source_hash,
                status,
                translated_html,
                translated_replyless_html,
                translated_text,
                translated_subject,
                translated_snippet,
                segments_json,
                model,
                created_at,
                updated_at
            FROM email_translations
            WHERE owner_scope = $1
              AND content_type = $2
              AND target_id = $3
              AND target_lang = $4
              AND source_hash = $5
            "#,
        )
        .bind(owner_scope)
        .bind(content_type)
        .bind(target_id)
        .bind(target_lang)
        .bind(source_hash)
        .fetch_optional(&self.pool)
        .await
        .map_err(|e| TranslationStoreError::Database(e.into()))?;

        Ok(row.map(PersistedTranslationRow::from))
    }

    async fn upsert_translation(
        &self,
        input: UpsertTranslationInput,
    ) -> Result<PersistedTranslationRow, TranslationStoreError> {
        let row = sqlx::query_as::<_, DbTranslationRow>(
            r#"
            INSERT INTO email_translations (
                owner_scope,
                link_id,
                thread_id,
                message_id,
                target_id,
                content_type,
                target_lang,
                source_hash,
                status,
                translated_html,
                translated_replyless_html,
                translated_text,
                translated_subject,
                translated_snippet,
                segments_json,
                model,
                updated_at
            )
            VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9,
                $10, $11, $12, $13, $14, $15, $16, NOW()
            )
            ON CONFLICT (owner_scope, content_type, target_id, target_lang, source_hash)
            DO UPDATE SET
                status = EXCLUDED.status,
                translated_html = EXCLUDED.translated_html,
                translated_replyless_html = EXCLUDED.translated_replyless_html,
                translated_text = EXCLUDED.translated_text,
                translated_subject = EXCLUDED.translated_subject,
                translated_snippet = EXCLUDED.translated_snippet,
                segments_json = EXCLUDED.segments_json,
                model = EXCLUDED.model,
                updated_at = NOW()
            RETURNING
                id,
                owner_scope,
                link_id,
                thread_id,
                message_id,
                target_id,
                content_type,
                target_lang,
                source_hash,
                status,
                translated_html,
                translated_replyless_html,
                translated_text,
                translated_subject,
                translated_snippet,
                segments_json,
                model,
                created_at,
                updated_at
            "#,
        )
        .bind(&input.owner_scope)
        .bind(input.link_id)
        .bind(input.thread_id)
        .bind(input.message_id)
        .bind(&input.target_id)
        .bind(&input.content_type)
        .bind(&input.target_lang)
        .bind(&input.source_hash)
        .bind(&input.status)
        .bind(&input.translated_html)
        .bind(&input.translated_replyless_html)
        .bind(&input.translated_text)
        .bind(&input.translated_subject)
        .bind(&input.translated_snippet)
        .bind(Json(&input.segments_json))
        .bind(&input.model)
        .fetch_one(&self.pool)
        .await
        .map_err(|e| TranslationStoreError::Database(e.into()))?;

        Ok(PersistedTranslationRow::from(row))
    }
}
