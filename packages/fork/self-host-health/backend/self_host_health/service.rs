use axum::{
    Json, Router,
    extract::State,
    http::StatusCode,
    response::IntoResponse,
    routing::{get, post},
};
use chrono::Utc;
use serde_json::json;
use std::collections::{HashMap, HashSet};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::RwLock;

use super::probes;
use super::types::{CheckCategory, HealthCheckItem, HealthStatus, SelfHostHealthReport};
use crate::api::{context::ApiContext, permissions_extractor::DbPermissionsExtractor};

const WRITE_ADMIN_PANEL_PERMISSION: &str = "write:admin_panel";
const CACHE_TTL: Duration = Duration::from_secs(10);

#[derive(Clone)]
pub struct SelfHostHealthService {
    context: ApiContext,
    state: Arc<RwLock<SelfHostHealthState>>,
}

#[derive(Default)]
struct SelfHostHealthState {
    by_user: HashMap<String, UserHealthState>,
}

#[derive(Default)]
struct UserHealthState {
    cached: Option<(Instant, SelfHostHealthReport)>,
    failure_since: Option<String>,
    consecutive_failures: u64,
}

impl SelfHostHealthService {
    pub fn new(context: ApiContext) -> Self {
        Self {
            context,
            state: Arc::new(RwLock::new(SelfHostHealthState::default())),
        }
    }

    pub async fn get_or_run_health_check(&self, macro_user_id: &str) -> SelfHostHealthReport {
        {
            let read = self.state.read().await;
            if let Some((timestamp, report)) = read
                .by_user
                .get(macro_user_id)
                .and_then(|state| state.cached.as_ref())
            {
                if timestamp.elapsed() < CACHE_TTL {
                    return report.clone();
                }
            }
        }

        let mut write = self.state.write().await;
        let user_state = write.by_user.entry(macro_user_id.to_string()).or_default();
        if let Some((timestamp, report)) = user_state.cached.as_ref() {
            if timestamp.elapsed() < CACHE_TTL {
                return report.clone();
            }
        }

        let mut report = if probes::is_self_host_health_enabled(&self.context) {
            probes::run_all_probes(&self.context, macro_user_id).await
        } else {
            disabled_report(self.context.environment)
        };

        if matches!(
            report.overall_status,
            HealthStatus::Critical | HealthStatus::Warning
        ) {
            user_state.consecutive_failures += 1;
            if user_state.failure_since.is_none() {
                user_state.failure_since = Some(report.last_checked_at.clone());
            }
        } else {
            user_state.consecutive_failures = 0;
            user_state.failure_since = None;
        }
        report.failure_since = user_state.failure_since.clone();
        report.consecutive_failures = user_state.consecutive_failures;

        user_state.cached = Some((Instant::now(), report.clone()));
        report
    }

    pub async fn repair_backfill_completion(&self, macro_user_id: &str) -> anyhow::Result<u64> {
        let result = sqlx::query(
            r#"
            UPDATE email_backfill_completion_outbox AS outbox
            SET published_at = NULL
            FROM email_backfill_jobs AS job
            JOIN email_links AS link ON link.id = job.link_id
            WHERE outbox.backfill_job_id = job.id
              AND link.macro_id = $1
              AND job.status = 'Complete'
              AND outbox.published_at IS NOT NULL
              AND outbox.completed_at IS NULL
              AND outbox.published_at < now() - interval '5 minutes'
              AND (
                  outbox.effects_lease_token IS NULL
                  OR (
                      outbox.effects_lease_expires_at IS NOT NULL
                      AND outbox.effects_lease_expires_at < now()
                  )
              )
            "#,
        )
        .bind(macro_user_id)
        .execute(&self.context.db)
        .await?;

        self.state.write().await.by_user.remove(macro_user_id);
        Ok(result.rows_affected())
    }

    pub async fn repair_opensearch_alignment(&self, macro_user_id: &str) -> anyhow::Result<serde_json::Value> {
        let url = macro_env_var::maybe_read_env("OPENSEARCH_URL")
            .ok_or_else(|| anyhow::anyhow!("OPENSEARCH_URL 未配置"))?;
        let username = macro_env_var::maybe_read_env("OPENSEARCH_USERNAME").unwrap_or_default();
        let password = macro_env_var::maybe_read_env("OPENSEARCH_PASSWORD").unwrap_or_default();

        let db_ids: Vec<String> = sqlx::query_scalar(
            r#"
            SELECT m.id::text
            FROM email_messages m
            WHERE m.is_draft = false
              AND (m.body_text IS NOT NULL OR m.body_html_sanitized IS NOT NULL)
              AND NOT EXISTS (
                  SELECT 1
                  FROM email_message_labels ml
                  JOIN email_labels l ON l.id = ml.label_id
                  WHERE ml.message_id = m.id
                    AND l.provider_label_id IN ('SPAM', 'TRASH')
              )
            "#,
        )
        .fetch_all(&self.context.db)
        .await?;
        let db_set: HashSet<String> = db_ids.into_iter().collect();

        let client = reqwest::Client::new();
        let mut os_ids = HashSet::new();

        let resp = client
            .post(format!("{url}/emails_v2/_search?scroll=2m&size=5000"))
            .basic_auth(&username, Some(&password))
            .json(&json!({ "_source": ["message_id"] }))
            .send()
            .await?
            .json::<serde_json::Value>()
            .await?;

        let mut scroll_id = resp["_scroll_id"].as_str().map(|s| s.to_string());
        if let Some(hits) = resp["hits"]["hits"].as_array() {
            for hit in hits {
                if let Some(mid) = hit["_source"]["message_id"].as_str() {
                    os_ids.insert(mid.to_string());
                }
            }
        }

        while let Some(sid) = scroll_id.take() {
            let next_resp = client
                .post(format!("{url}/_search/scroll"))
                .basic_auth(&username, Some(&password))
                .json(&json!({ "scroll": "2m", "scroll_id": sid }))
                .send()
                .await?
                .json::<serde_json::Value>()
                .await?;

            scroll_id = next_resp["_scroll_id"].as_str().map(|s| s.to_string());
            if let Some(hits) = next_resp["hits"]["hits"].as_array() {
                if hits.is_empty() {
                    break;
                }
                for hit in hits {
                    if let Some(mid) = hit["_source"]["message_id"].as_str() {
                        os_ids.insert(mid.to_string());
                    }
                }
            } else {
                break;
            }
        }

        let orphan_in_os: Vec<String> = os_ids.difference(&db_set).cloned().collect();
        let mut deleted_orphans = 0usize;

        if !orphan_in_os.is_empty() {
            for chunk in orphan_in_os.chunks(100) {
                let delete_res = client
                    .post(format!("{url}/emails_v2/_delete_by_query?refresh=true"))
                    .basic_auth(&username, Some(&password))
                    .json(&json!({
                        "query": {
                            "terms": {
                                "message_id": chunk
                            }
                        }
                    }))
                    .send()
                    .await?;
                if delete_res.status().is_success() {
                    let val = delete_res.json::<serde_json::Value>().await?;
                    deleted_orphans += val["deleted"].as_u64().unwrap_or(chunk.len() as u64) as usize;
                }
            }
        }

        let missing_in_os: Vec<String> = db_set.difference(&os_ids).cloned().collect();
        let mut queued_backfill_threads = 0usize;
        if !missing_in_os.is_empty() {
            let thread_ids: Vec<uuid::Uuid> = sqlx::query_scalar(
                r#"
                SELECT DISTINCT thread_id
                FROM email_messages
                WHERE id = ANY($1)
                "#,
            )
            .bind(&missing_in_os.iter().filter_map(|s| s.parse::<uuid::Uuid>().ok()).collect::<Vec<_>>())
            .fetch_all(&self.context.db)
            .await?;

            queued_backfill_threads = thread_ids.len();
            if !thread_ids.is_empty() {
                let sps_url = macro_env_var::maybe_read_env("SEARCH_PROCESSING_URL")
                    .unwrap_or_else(|| "http://macro-selfhost-search_processing_service-1:8080".to_string());
                let _ = client
                    .post(format!("{sps_url}/search-processing/internal/backfill/emails"))
                    .json(&json!({
                        "thread_ids": thread_ids
                    }))
                    .send()
                    .await;
            }
        }

        self.state.write().await.by_user.remove(macro_user_id);

        Ok(json!({
            "deleted_orphans": deleted_orphans,
            "queued_backfill_threads": queued_backfill_threads,
        }))
    }

    pub async fn repair_queue_backlog(&self, macro_user_id: &str) -> anyhow::Result<serde_json::Value> {
        let queues = [
            (
                "gmail_inbox_sync",
                self.context.sqs_client.gmail_inbox_sync_queue_url(),
            ),
            (
                "gmail_inbox_sync_retry",
                self.context.sqs_client.gmail_inbox_sync_retry_queue_url(),
            ),
            ("gmail_ops", self.context.sqs_client.gmail_ops_queue_url()),
            (
                "gmail_ops_retry",
                self.context.sqs_client.gmail_ops_retry_queue_url(),
            ),
            (
                "email_link_manager",
                self.context.sqs_client.email_link_manager_queue_url(),
            ),
            (
                "email_backfill",
                self.context.sqs_client.email_backfill_queue_url(),
            ),
        ];

        let mut purged_dlqs = Vec::new();

        for (name, queue_url) in queues {
            let Some(queue_url) = queue_url else { continue };
            if let Ok(attributes) = self.context.sqs_client.get_queue_attributes(queue_url).await {
                if let Some(dlq_name) = attributes.redrive_policy.as_deref().and_then(|p| {
                    serde_json::from_str::<serde_json::Value>(p)
                        .ok()
                        .and_then(|v| v.get("deadLetterTargetArn").and_then(|a| a.as_str()).map(|s| {
                            s.split(':').last().unwrap_or(s).to_string()
                        }))
                }) {
                    if let Ok(dlq_url) = self.context.sqs_client.resolve_queue_url(&dlq_name).await {
                        if let Ok(dlq_attrs) = self.context.sqs_client.get_queue_attributes(&dlq_url).await {
                            let total = dlq_attrs.visible_messages + dlq_attrs.delayed_messages + dlq_attrs.not_visible_messages;
                            if total > 0 {
                                let mut drained = 0;
                                while let Ok(messages) = self.context.sqs_client.receive_messages(&dlq_url, 10, 1).await {
                                    if messages.is_empty() { break; }
                                    for msg in &messages {
                                        if let Some(receipt) = &msg.receipt_handle {
                                            let _ = self.context.sqs_client.delete_message(&dlq_url, receipt).await;
                                            drained += 1;
                                        }
                                    }
                                }
                                purged_dlqs.push(json!({
                                    "queue": name,
                                    "dlq": dlq_name,
                                    "drained": drained,
                                }));
                            }
                        }
                    }
                }
            }
        }

        self.state.write().await.by_user.remove(macro_user_id);

        Ok(json!({
            "purged_dlqs": purged_dlqs,
        }))
    }
}

fn disabled_report(environment: macro_env::Environment) -> SelfHostHealthReport {
    SelfHostHealthReport {
        overall_status: HealthStatus::Disabled,
        environment: format!("{:?}", environment),
        is_production: false,
        last_checked_at: Utc::now().to_rfc3339(),
        failure_since: None,
        consecutive_failures: 0,
        duration_ms: 0,
        checks: vec![HealthCheckItem {
            id: "self_host_health_production_gate".to_string(),
            name: "自托管生产健康检查".to_string(),
            category: CheckCategory::Services,
            status: HealthStatus::Disabled,
            message: "非生产环境不运行自托管生产健康探针".to_string(),
            details: None,
            remediation_hint: None,
            duration_ms: 0,
        }],
    }
}

pub fn router(context: ApiContext) -> Router<ApiContext> {
    let service = SelfHostHealthService::new(context);
    let health_service = service.clone();
    let backfill_service = service.clone();
    let os_service = service.clone();
    let queue_service = service;

    Router::new()
        .route(
            "/health-check",
            get(
                move |State(_): State<ApiContext>, db_permissions: DbPermissionsExtractor| {
                    let service = health_service.clone();
                    async move {
                        if !db_permissions
                            .permissions
                            .contains(WRITE_ADMIN_PANEL_PERMISSION)
                        {
                            return (
                                StatusCode::FORBIDDEN,
                                Json(serde_json::json!({
                                    "error": "Insufficient permissions: write:admin_panel required"
                                })),
                            )
                                .into_response();
                        }

                        let macro_user_id = db_permissions
                            .authorization
                            .authorization
                            .user
                            .user_context
                            .user_id
                            .clone();
                        let report = service.get_or_run_health_check(&macro_user_id).await;
                        (StatusCode::OK, Json(report)).into_response()
                    }
                },
            ),
        )
        .route(
            "/health-check/repair/backfill-completion",
            post(
                move |State(_): State<ApiContext>, db_permissions: DbPermissionsExtractor| {
                    let service = backfill_service.clone();
                    async move {
                        if !db_permissions
                            .permissions
                            .contains(WRITE_ADMIN_PANEL_PERMISSION)
                        {
                            return (
                                StatusCode::FORBIDDEN,
                                Json(serde_json::json!({
                                    "error": "Insufficient permissions: write:admin_panel required"
                                })),
                            )
                                .into_response();
                        }

                        let macro_user_id = db_permissions
                            .authorization
                            .authorization
                            .user
                            .user_context
                            .user_id
                            .clone();
                        match service.repair_backfill_completion(&macro_user_id).await {
                            Ok(requeued) => (
                                StatusCode::OK,
                                Json(serde_json::json!({ "requeued": requeued })),
                            )
                                .into_response(),
                            Err(err) => (
                                StatusCode::INTERNAL_SERVER_ERROR,
                                Json(serde_json::json!({ "error": err.to_string() })),
                            )
                                .into_response(),
                        }
                    }
                },
            ),
        )
        .route(
            "/health-check/repair/opensearch-alignment",
            post(
                move |State(_): State<ApiContext>, db_permissions: DbPermissionsExtractor| {
                    let service = os_service.clone();
                    async move {
                        if !db_permissions
                            .permissions
                            .contains(WRITE_ADMIN_PANEL_PERMISSION)
                        {
                            return (
                                StatusCode::FORBIDDEN,
                                Json(serde_json::json!({
                                    "error": "Insufficient permissions: write:admin_panel required"
                                })),
                            )
                                .into_response();
                        }

                        let macro_user_id = db_permissions
                            .authorization
                            .authorization
                            .user
                            .user_context
                            .user_id
                            .clone();
                        match service.repair_opensearch_alignment(&macro_user_id).await {
                            Ok(result) => (StatusCode::OK, Json(result)).into_response(),
                            Err(err) => (
                                StatusCode::INTERNAL_SERVER_ERROR,
                                Json(serde_json::json!({ "error": err.to_string() })),
                            )
                                .into_response(),
                        }
                    }
                },
            ),
        )
        .route(
            "/health-check/repair/queue-backlog",
            post(
                move |State(_): State<ApiContext>, db_permissions: DbPermissionsExtractor| {
                    let service = queue_service.clone();
                    async move {
                        if !db_permissions
                            .permissions
                            .contains(WRITE_ADMIN_PANEL_PERMISSION)
                        {
                            return (
                                StatusCode::FORBIDDEN,
                                Json(serde_json::json!({
                                    "error": "Insufficient permissions: write:admin_panel required"
                                })),
                            )
                                .into_response();
                        }

                        let macro_user_id = db_permissions
                            .authorization
                            .authorization
                            .user
                            .user_context
                            .user_id
                            .clone();
                        match service.repair_queue_backlog(&macro_user_id).await {
                            Ok(result) => (StatusCode::OK, Json(result)).into_response(),
                            Err(err) => (
                                StatusCode::INTERNAL_SERVER_ERROR,
                                Json(serde_json::json!({ "error": err.to_string() })),
                            )
                                .into_response(),
                        }
                    }
                },
            ),
        )
}
