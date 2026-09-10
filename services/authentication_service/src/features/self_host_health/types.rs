use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum HealthStatus {
    Ok,
    Warning,
    Critical,
    Disabled,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CheckCategory {
    Auth,
    Database,
    Storage,
    Queues,
    Gmail,
    ReadReceipts,
    Dss,
    Services,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HealthCheckItem {
    pub id: String,
    pub name: String,
    pub category: CheckCategory,
    pub status: HealthStatus,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub details: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub remediation_hint: Option<String>,
    pub duration_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SelfHostHealthReport {
    pub overall_status: HealthStatus,
    pub environment: String,
    pub is_production: bool,
    pub last_checked_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub failure_since: Option<String>,
    pub consecutive_failures: u64,
    pub duration_ms: u64,
    pub checks: Vec<HealthCheckItem>,
}
