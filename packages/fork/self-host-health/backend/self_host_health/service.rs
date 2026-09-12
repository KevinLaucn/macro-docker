use axum::{Json, Router, extract::State, http::StatusCode, response::IntoResponse, routing::get};
use chrono::Utc;
use std::collections::HashMap;
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

        if report.overall_status == HealthStatus::Critical {
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
    Router::new().route(
        "/health-check",
        get(
            move |State(_): State<ApiContext>, db_permissions: DbPermissionsExtractor| {
                let service = service.clone();
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
}
