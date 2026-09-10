use chrono::Utc;
use macro_service_urls::DocumentStorageServiceUrl;
use serde::Deserialize;
use serde_json::json;
use sqlx::Row;
use std::{
    collections::HashMap,
    sync::LazyLock,
    time::{Duration, Instant},
};

use super::types::{CheckCategory, HealthCheckItem, HealthStatus, SelfHostHealthReport};
use crate::api::context::ApiContext;

const PROBE_TIMEOUT: Duration = Duration::from_secs(3);
const GMAIL_DEEP_PROBE_CACHE_TTL: Duration = Duration::from_secs(10 * 60);
const GMAIL_SYNC_STALE_MINUTES: i64 = 10;
const QUEUE_WARNING_DEPTH: i64 = 100;
const QUEUE_CRITICAL_DEPTH: i64 = 1000;

static GMAIL_DEEP_PROBE_CACHE: LazyLock<
    tokio::sync::Mutex<HashMap<String, (Instant, HealthCheckItem)>>,
> = LazyLock::new(|| tokio::sync::Mutex::new(HashMap::new()));

pub async fn run_all_probes(context: &ApiContext, macro_user_id: &str) -> SelfHostHealthReport {
    let overall_start = Instant::now();
    let mut checks = Vec::new();

    // 1. MacroDB connection & User Parity
    checks.push(probe_database_parity(context).await);

    // 2. FusionAuth IdP Contract
    checks.push(probe_fusionauth_idp(context).await);

    // 3. Gmail Linked Inboxes
    checks.push(probe_gmail_inboxes(context, macro_user_id).await);

    // 4. SQS queue backlog / DLQ health
    checks.push(probe_queues(context).await);

    // 5. Read Receipts Tracking Pixel Endpoint
    checks.push(probe_read_receipts_pixel(context).await);

    // 6. Document Storage Service (DSS)
    checks.push(probe_dss_service(context).await);

    // Calculate overall status
    let mut overall_status = HealthStatus::Ok;
    for check in &checks {
        match check.status {
            HealthStatus::Critical => {
                overall_status = HealthStatus::Critical;
                break;
            }
            HealthStatus::Warning => {
                if overall_status != HealthStatus::Critical {
                    overall_status = HealthStatus::Warning;
                }
            }
            _ => {}
        }
    }

    let is_production = matches!(context.environment, macro_env::Environment::Production);

    SelfHostHealthReport {
        overall_status,
        environment: format!("{:?}", context.environment),
        is_production,
        last_checked_at: Utc::now().to_rfc3339(),
        failure_since: None,
        consecutive_failures: 0,
        duration_ms: overall_start.elapsed().as_millis() as u64,
        checks,
    }
}

async fn probe_database_parity(context: &ApiContext) -> HealthCheckItem {
    let start = Instant::now();
    let res = tokio::time::timeout(PROBE_TIMEOUT, async {
        let count: i64 = sqlx::query_scalar(
            r#"SELECT count(*) FROM "User" u LEFT JOIN "macro_user" m ON u.macro_user_id = m.id WHERE m.id IS NULL"#
        )
        .fetch_one(&context.db)
        .await?;
        Ok::<i64, sqlx::Error>(count)
    }).await;

    let duration_ms = start.elapsed().as_millis() as u64;

    match res {
        Ok(Ok(orphaned_count)) => {
            if orphaned_count == 0 {
                HealthCheckItem {
                    id: "database_user_parity".to_string(),
                    name: "MacroDB 用户外键一致性".to_string(),
                    category: CheckCategory::Database,
                    status: HealthStatus::Ok,
                    message: "所有 User.macro_user_id 档案在 macro_user 均完整有效".to_string(),
                    details: None,
                    remediation_hint: None,
                    duration_ms,
                }
            } else {
                HealthCheckItem {
                    id: "database_user_parity".to_string(),
                    name: "MacroDB 用户外键一致性".to_string(),
                    category: CheckCategory::Database,
                    status: HealthStatus::Critical,
                    message: format!(
                        "检测到 {} 条孤儿用户记录，可能导致建团队与绑邮箱异常",
                        orphaned_count
                    ),
                    details: Some(
                        "User 表中的 macro_user_id 找不到对应的 macro_user 记录。".to_string(),
                    ),
                    remediation_hint: Some(
                        "请执行修复脚本补齐 macro_user 档案，保持 FusionAuth 与 MacroDB 双层对齐。"
                            .to_string(),
                    ),
                    duration_ms,
                }
            }
        }
        Ok(Err(err)) => HealthCheckItem {
            id: "database_user_parity".to_string(),
            name: "MacroDB 数据库连接".to_string(),
            category: CheckCategory::Database,
            status: HealthStatus::Critical,
            message: format!("数据库查询失败: {err}"),
            details: Some(format!("{err:?}")),
            remediation_hint: Some("检查 PostgreSQL 容器运行状态及网络连接。".to_string()),
            duration_ms,
        },
        Err(_) => HealthCheckItem {
            id: "database_user_parity".to_string(),
            name: "MacroDB 数据库连接".to_string(),
            category: CheckCategory::Database,
            status: HealthStatus::Critical,
            message: "数据库查询超时 (3s)".to_string(),
            details: None,
            remediation_hint: Some("检查数据库连接池是否耗尽或数据库负载过高。".to_string()),
            duration_ms,
        },
    }
}

async fn probe_fusionauth_idp(context: &ApiContext) -> HealthCheckItem {
    let start = Instant::now();
    let res = tokio::time::timeout(PROBE_TIMEOUT, async {
        let google_res = context
            .auth_client
            .get_identity_provider_id_by_name("google")
            .await;
        let gmail_res = context
            .auth_client
            .get_identity_provider_id_by_name("google_gmail")
            .await;
        (google_res, gmail_res)
    })
    .await;

    let duration_ms = start.elapsed().as_millis() as u64;

    match res {
        Ok((Ok(_), Ok(_))) => HealthCheckItem {
            id: "fusionauth_idp".to_string(),
            name: "FusionAuth 身份源配置 (IdP)".to_string(),
            category: CheckCategory::Auth,
            status: HealthStatus::Ok,
            message: "Google 与 google_gmail 身份源均已正确注册并在运行".to_string(),
            details: None,
            remediation_hint: None,
            duration_ms,
        },
        Ok((Err(err1), _)) => HealthCheckItem {
            id: "fusionauth_idp".to_string(),
            name: "FusionAuth 身份源配置 (IdP)".to_string(),
            category: CheckCategory::Auth,
            status: HealthStatus::Critical,
            message: format!("FusionAuth Google 身份源查询失败: {err1}"),
            details: Some(format!("{err1:?}")),
            remediation_hint: Some(
                "请检查 FusionAuth 中是否已导入并启用 google 身份提供商。".to_string(),
            ),
            duration_ms,
        },
        Ok((_, Err(err2))) => HealthCheckItem {
            id: "fusionauth_idp".to_string(),
            name: "FusionAuth 身份源配置 (IdP)".to_string(),
            category: CheckCategory::Auth,
            status: HealthStatus::Critical,
            message: format!("FusionAuth google_gmail 身份源未注册或不可达: {err2}"),
            details: Some(format!("{err2:?}")),
            remediation_hint: Some(
                "请检查 FusionAuth 中是否已创建 google_gmail 身份提供商，用于 Gmail 同步权限。"
                    .to_string(),
            ),
            duration_ms,
        },
        Err(_) => HealthCheckItem {
            id: "fusionauth_idp".to_string(),
            name: "FusionAuth 身份源配置 (IdP)".to_string(),
            category: CheckCategory::Auth,
            status: HealthStatus::Critical,
            message: "FusionAuth 探测超时 (3s)".to_string(),
            details: None,
            remediation_hint: Some("检查 FusionAuth 服务与反代健康状态。".to_string()),
            duration_ms,
        },
    }
}

async fn probe_gmail_inboxes(context: &ApiContext, macro_user_id: &str) -> HealthCheckItem {
    let start = Instant::now();
    if let Some(cached) = cached_gmail_probe(macro_user_id).await {
        return cached;
    }

    let res = tokio::time::timeout(PROBE_TIMEOUT, async {
        let rows = sqlx::query(
            r#"
            SELECT
                el.id::text AS id,
                el.email_address,
                el.fusionauth_user_id,
                el.is_sync_active,
                el.needs_reauth,
                el.last_sync_error_at,
                gh.history_id AS local_history_id,
                gh.updated_at AS local_history_updated_at,
                bj.status AS backfill_status,
                bj.total_threads,
                bj.threads_retrieved_count,
                bj.updated_at AS backfill_updated_at,
                (SELECT count(*) FROM email_messages em WHERE em.link_id = el.id) AS local_messages,
                (SELECT count(*) FROM email_threads et WHERE et.link_id = el.id) AS local_threads
            FROM email_links el
            LEFT JOIN email_gmail_histories gh ON gh.link_id = el.id
            LEFT JOIN LATERAL (
                SELECT status, total_threads, threads_retrieved_count, updated_at
                FROM email_backfill_jobs
                WHERE link_id = el.id
                ORDER BY created_at DESC
                LIMIT 1
            ) bj ON true
            WHERE el.macro_id = $1
            ORDER BY el.created_at ASC
            "#,
        )
        .bind(macro_user_id)
        .fetch_all(&context.db)
        .await?;
        Ok::<Vec<sqlx::postgres::PgRow>, sqlx::Error>(rows)
    })
    .await;

    let duration_ms = start.elapsed().as_millis() as u64;

    let item = match res {
        Ok(Ok(rows)) => {
            if rows.is_empty() {
                return cache_gmail_probe_item(
                    macro_user_id,
                    HealthCheckItem {
                        id: "gmail_inboxes_sync".to_string(),
                        name: "Gmail 邮箱授权与同步".to_string(),
                        category: CheckCategory::Gmail,
                        status: HealthStatus::Ok,
                        message: "当前暂无绑定的 Gmail 邮箱".to_string(),
                        details: None,
                        remediation_hint: None,
                        duration_ms,
                    },
                )
                .await;
            }

            let mut needs_reauth_list = Vec::new();
            let mut official_failures = Vec::new();
            let mut stale_syncs = Vec::new();
            let mut details = Vec::new();
            let mut active_count = 0;
            let gmail_topic = macro_env_var::maybe_read_env("GMAIL_GCP_QUEUE")
                .map(|value| value.trim().to_owned())
                .filter(|value| !value.is_empty());
            let gmail_idp_id = match context
                .auth_client
                .get_identity_provider_id_by_name("google_gmail")
                .await
            {
                Ok(idp_id) => idp_id,
                Err(err) => {
                    return cache_gmail_probe_item(
                        macro_user_id,
                        HealthCheckItem {
                            id: "gmail_official_sync".to_string(),
                            name: "Gmail 官方 API / Watch / 同步进度".to_string(),
                            category: CheckCategory::Gmail,
                            status: HealthStatus::Critical,
                            message: format!("FusionAuth google_gmail IdP 查询失败: {err}"),
                            details: None,
                            remediation_hint: Some(
                                "请检查 FusionAuth 中是否已创建 google_gmail 身份提供商。"
                                    .to_string(),
                            ),
                            duration_ms,
                        },
                    )
                    .await;
                }
            };

            for row in &rows {
                let email: String = row.try_get("email_address").unwrap_or_default();
                let is_sync: bool = row.try_get("is_sync_active").unwrap_or(false);
                let needs_reauth: bool = row.try_get("needs_reauth").unwrap_or(false);
                let fusionauth_user_id: String =
                    row.try_get("fusionauth_user_id").unwrap_or_default();
                let local_history_id: Option<String> =
                    row.try_get("local_history_id").unwrap_or_default();
                let local_history_updated_at: Option<chrono::DateTime<Utc>> =
                    row.try_get("local_history_updated_at").unwrap_or_default();
                let local_messages: i64 = row.try_get("local_messages").unwrap_or_default();
                let local_threads: i64 = row.try_get("local_threads").unwrap_or_default();
                let backfill_status: Option<String> =
                    row.try_get("backfill_status").unwrap_or_default();
                let total_threads: Option<i64> = row.try_get("total_threads").unwrap_or_default();
                let threads_retrieved_count: Option<i64> =
                    row.try_get("threads_retrieved_count").unwrap_or_default();

                if needs_reauth {
                    needs_reauth_list.push(email);
                    continue;
                }

                if !is_sync {
                    details.push(format!("{email}: 同步未启用"));
                    continue;
                }

                active_count += 1;

                match fetch_gmail_access_token(context, &fusionauth_user_id, &email, &gmail_idp_id)
                    .await
                {
                    Ok(access_token) => match fetch_gmail_profile(&access_token).await {
                        Ok(profile) => {
                            let watch_result = match &gmail_topic {
                                Some(topic) => renew_gmail_watch(&access_token, topic).await,
                                None => {
                                    Err("缺少 GMAIL_GCP_QUEUE，无法续订 Gmail watch".to_string())
                                }
                            };

                            if let Err(err) = &watch_result {
                                official_failures
                                    .push(format!("{email}: Gmail watch 续订失败: {err}"));
                            }

                            let remote_history = profile.history_id.as_str();
                            let stale = local_history_id
                                .as_deref()
                                .filter(|history| *history != remote_history)
                                .and(local_history_updated_at)
                                .map(|updated_at| {
                                    Utc::now().signed_duration_since(updated_at).num_minutes()
                                        >= GMAIL_SYNC_STALE_MINUTES
                                })
                                .unwrap_or(false);

                            if stale {
                                stale_syncs.push(email.clone());
                            }

                            let watch_detail = watch_result
                                .map(|watch| {
                                    format!(
                                        "watch_history_id={}, watch_expires_at={}",
                                        watch.history_id, watch.expiration
                                    )
                                })
                                .unwrap_or_else(|err| format!("watch_error={err}"));
                            details.push(format!(
                                "{}: official messages={}, threads={}, history_id={}; local messages={}, threads={}, history_id={:?}; backfill status={:?}, {}/{}; {}",
                                email,
                                profile.messages_total,
                                profile.threads_total,
                                profile.history_id,
                                local_messages,
                                local_threads,
                                local_history_id,
                                backfill_status,
                                threads_retrieved_count.unwrap_or_default(),
                                total_threads.unwrap_or_default(),
                                watch_detail
                            ));
                        }
                        Err(err) => {
                            official_failures
                                .push(format!("{email}: Gmail profile 查询失败: {err}"));
                        }
                    },
                    Err(err) => {
                        official_failures.push(format!("{email}: OAuth token 刷新失败: {err}"));
                    }
                }
            }

            if !needs_reauth_list.is_empty() {
                HealthCheckItem {
                    id: "gmail_inboxes_sync".to_string(),
                    name: "Gmail 邮箱授权与同步".to_string(),
                    category: CheckCategory::Gmail,
                    status: HealthStatus::Critical,
                    message: format!(
                        "发现 {} 个邮箱需要重新授权: {}",
                        needs_reauth_list.len(),
                        needs_reauth_list.join(", ")
                    ),
                    details: Some(
                        "OAuth Grant 已过期或被撤销，Gmail 同步与推送已中断。".to_string(),
                    ),
                    remediation_hint: Some(
                        "请在界面中重新点击“连接邮箱”以完成 Google OAuth 续期。".to_string(),
                    ),
                    duration_ms,
                }
            } else {
                if !official_failures.is_empty() {
                    return cache_gmail_probe_item(
                        macro_user_id,
                        HealthCheckItem {
                        id: "gmail_official_sync".to_string(),
                        name: "Gmail 官方 API / Watch / 同步进度".to_string(),
                        category: CheckCategory::Gmail,
                        status: HealthStatus::Critical,
                        message: format!("Gmail 官方链路异常: {}", official_failures.join("; ")),
                        details: Some(details.join("\n")),
                        remediation_hint: Some(
                            "检查 Google OAuth、GMAIL_GCP_QUEUE/PubSub topic、Gmail API 权限与 email-service webhook 配置。"
                                .to_string(),
                        ),
                        duration_ms,
                        },
                    )
                    .await;
                }

                if !stale_syncs.is_empty() {
                    return cache_gmail_probe_item(
                        macro_user_id,
                        HealthCheckItem {
                        id: "gmail_official_sync".to_string(),
                        name: "Gmail 官方 API / Watch / 同步进度".to_string(),
                        category: CheckCategory::Gmail,
                        status: HealthStatus::Warning,
                        message: format!(
                            "发现 {} 个邮箱 Gmail historyId 长时间未推进: {}",
                            stale_syncs.len(),
                            stale_syncs.join(", ")
                        ),
                        details: Some(details.join("\n")),
                        remediation_hint: Some(
                            "检查 Gmail push webhook、pubsub workers、SQS/DLQ 积压和 email_gmail_histories 更新。"
                                .to_string(),
                        ),
                        duration_ms,
                        },
                    )
                    .await;
                }

                HealthCheckItem {
                    id: "gmail_official_sync".to_string(),
                    name: "Gmail 官方 API / Watch / 同步进度".to_string(),
                    category: CheckCategory::Gmail,
                    status: HealthStatus::Ok,
                    message: format!(
                        "所有 {} 个邮箱授权、官方 API、watch 续订与同步进度正常 (活跃同步: {})",
                        rows.len(),
                        active_count
                    ),
                    details: Some(details.join("\n")),
                    remediation_hint: None,
                    duration_ms,
                }
            }
        }
        Ok(Err(err)) => HealthCheckItem {
            id: "gmail_inboxes_sync".to_string(),
            name: "Gmail 邮箱授权与同步".to_string(),
            category: CheckCategory::Gmail,
            status: HealthStatus::Warning,
            message: format!("查询 email_links 失败: {err}"),
            details: Some(format!("{err:?}")),
            remediation_hint: Some("检查 MacroDB email_links 表状态。".to_string()),
            duration_ms,
        },
        Err(_) => HealthCheckItem {
            id: "gmail_inboxes_sync".to_string(),
            name: "Gmail 邮箱授权与同步".to_string(),
            category: CheckCategory::Gmail,
            status: HealthStatus::Warning,
            message: "Gmail 状态查询超时 (3s)".to_string(),
            details: None,
            remediation_hint: None,
            duration_ms,
        },
    };

    cache_gmail_probe(macro_user_id, item.clone()).await;
    item
}

async fn cached_gmail_probe(macro_user_id: &str) -> Option<HealthCheckItem> {
    let cache = GMAIL_DEEP_PROBE_CACHE.lock().await;
    let (checked_at, item) = cache.get(macro_user_id)?;
    if checked_at.elapsed() < GMAIL_DEEP_PROBE_CACHE_TTL {
        return Some(item.clone());
    }
    None
}

async fn cache_gmail_probe(macro_user_id: &str, item: HealthCheckItem) {
    let mut cache = GMAIL_DEEP_PROBE_CACHE.lock().await;
    cache.insert(macro_user_id.to_string(), (Instant::now(), item));
}

async fn cache_gmail_probe_item(macro_user_id: &str, item: HealthCheckItem) -> HealthCheckItem {
    cache_gmail_probe(macro_user_id, item.clone()).await;
    item
}

#[derive(Debug, Deserialize)]
struct GmailProfile {
    #[serde(rename = "messagesTotal")]
    messages_total: i64,
    #[serde(rename = "threadsTotal")]
    threads_total: i64,
    #[serde(rename = "historyId")]
    history_id: String,
}

#[derive(Debug, Deserialize)]
struct GmailWatchResponse {
    #[serde(rename = "historyId")]
    history_id: String,
    expiration: String,
}

async fn fetch_gmail_access_token(
    context: &ApiContext,
    fusionauth_user_id: &str,
    email: &str,
    gmail_idp_id: &str,
) -> Result<String, String> {
    let links = context
        .auth_client
        .get_links(fusionauth_user_id, Some(gmail_idp_id.to_string()))
        .await
        .map_err(|err| format!("{err}"))?;

    let link = links
        .into_iter()
        .find(|link| link.display_name.as_str() == email)
        .ok_or_else(|| "FusionAuth 中找不到该邮箱的 google_gmail link".to_string())?;

    let token = context
        .auth_client
        .refresh_google_token(link.token.as_str())
        .await
        .map_err(|err| format!("{err}"))?;

    Ok(token.access_token)
}

async fn fetch_gmail_profile(access_token: &str) -> Result<GmailProfile, String> {
    let client = reqwest::Client::builder()
        .timeout(PROBE_TIMEOUT)
        .build()
        .map_err(|err| format!("{err}"))?;

    let response = client
        .get("https://gmail.googleapis.com/gmail/v1/users/me/profile")
        .bearer_auth(access_token)
        .send()
        .await
        .map_err(|err| format!("{err}"))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(format!("HTTP {status}: {}", sanitize_detail(&body)));
    }

    response
        .json::<GmailProfile>()
        .await
        .map_err(|err| format!("{err}"))
}

async fn renew_gmail_watch(
    access_token: &str,
    topic_name: &str,
) -> Result<GmailWatchResponse, String> {
    let client = reqwest::Client::builder()
        .timeout(PROBE_TIMEOUT)
        .build()
        .map_err(|err| format!("{err}"))?;

    let response = client
        .post("https://gmail.googleapis.com/gmail/v1/users/me/watch")
        .bearer_auth(access_token)
        .json(&json!({ "topicName": topic_name }))
        .send()
        .await
        .map_err(|err| format!("{err}"))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(format!("HTTP {status}: {}", sanitize_detail(&body)));
    }

    response
        .json::<GmailWatchResponse>()
        .await
        .map_err(|err| format!("{err}"))
}

async fn probe_read_receipts_pixel(_context: &ApiContext) -> HealthCheckItem {
    let start = Instant::now();
    let email_url = match self_host_public_email_url() {
        Ok(url) => url,
        Err(message) => {
            return HealthCheckItem {
                id: "read_receipts_pixel".to_string(),
                name: "邮件打开追踪像素端点 (Read Receipts)".to_string(),
                category: CheckCategory::ReadReceipts,
                status: HealthStatus::Critical,
                message,
                details: None,
                remediation_hint: Some(
                    "请配置 EMAIL_SERVICE_PUBLIC_URL 指向自托管公网 email-service 入口。"
                        .to_string(),
                ),
                duration_ms: start.elapsed().as_millis() as u64,
            };
        }
    };
    let probe_url = format!(
        "{}/t/o/00000000-0000-0000-0000-000000000000",
        email_url.trim_end_matches('/')
    );

    let client = reqwest::Client::builder()
        .timeout(PROBE_TIMEOUT)
        .build()
        .unwrap_or_default();

    let res = client.get(&probe_url).send().await;
    let duration_ms = start.elapsed().as_millis() as u64;

    match res {
        Ok(resp) => {
            let status = resp.status();
            let content_type = resp
                .headers()
                .get(reqwest::header::CONTENT_TYPE)
                .and_then(|v| v.to_str().ok())
                .unwrap_or("")
                .to_string();

            if status == reqwest::StatusCode::OK && content_type.contains("image/gif") {
                HealthCheckItem {
                    id: "read_receipts_pixel".to_string(),
                    name: "邮件打开追踪像素端点 (Read Receipts)".to_string(),
                    category: CheckCategory::ReadReceipts,
                    status: HealthStatus::Ok,
                    message: "追踪像素公共端点响应正常 (200 image/gif)".to_string(),
                    details: None,
                    remediation_hint: None,
                    duration_ms,
                }
            } else if status == reqwest::StatusCode::NOT_FOUND {
                HealthCheckItem {
                    id: "read_receipts_pixel".to_string(),
                    name: "邮件打开追踪像素端点 (Read Receipts)".to_string(),
                    category: CheckCategory::ReadReceipts,
                    status: HealthStatus::Critical,
                    message: format!("端点返回 404 Not Found (探测路径: {probe_url})"),
                    details: Some("email-service 路由未挂载或反向代理路径重写缺失。".to_string()),
                    remediation_hint: Some(
                        "检查 Caddy / Nginx 反向代理是否将 /t/o/* 正确转发至 email-service。"
                            .to_string(),
                    ),
                    duration_ms,
                }
            } else {
                HealthCheckItem {
                    id: "read_receipts_pixel".to_string(),
                    name: "邮件打开追踪像素端点 (Read Receipts)".to_string(),
                    category: CheckCategory::ReadReceipts,
                    status: HealthStatus::Critical,
                    message: format!(
                        "端点返回异常状态: {} (Content-Type: {})",
                        status, content_type
                    ),
                    details: Some(format!("URL: {probe_url}")),
                    remediation_hint: Some("像素追踪端点应允许免鉴权匿名 GET 请求。".to_string()),
                    duration_ms,
                }
            }
        }
        Err(err) => HealthCheckItem {
            id: "read_receipts_pixel".to_string(),
            name: "邮件打开追踪像素端点 (Read Receipts)".to_string(),
            category: CheckCategory::ReadReceipts,
            status: HealthStatus::Critical,
            message: format!("像素端点网络不可达: {err}"),
            details: Some(format!("URL: {probe_url}")),
            remediation_hint: Some("检查 email-service 运行状态及内部网络解析。".to_string()),
            duration_ms,
        },
    }
}

async fn probe_queues(context: &ApiContext) -> HealthCheckItem {
    let start = Instant::now();
    let queues = [
        (
            "gmail_inbox_sync",
            context.sqs_client.gmail_inbox_sync_queue_url(),
        ),
        (
            "gmail_inbox_sync_retry",
            context.sqs_client.gmail_inbox_sync_retry_queue_url(),
        ),
        ("gmail_ops", context.sqs_client.gmail_ops_queue_url()),
        (
            "gmail_ops_retry",
            context.sqs_client.gmail_ops_retry_queue_url(),
        ),
        (
            "email_link_manager",
            context.sqs_client.email_link_manager_queue_url(),
        ),
        (
            "email_backfill",
            context.sqs_client.email_backfill_queue_url(),
        ),
    ];

    let res = tokio::time::timeout(PROBE_TIMEOUT, async {
        let mut details = Vec::new();
        let mut missing = Vec::new();
        let mut warnings = Vec::new();
        let mut criticals = Vec::new();

        for (name, queue_url) in queues {
            let Some(queue_url) = queue_url else {
                missing.push(name.to_string());
                continue;
            };
            let attributes = context
                .sqs_client
                .get_queue_attributes(queue_url)
                .await
                .map_err(|err| format!("{name}: {err}"))?;
            let total = attributes.visible_messages
                + attributes.delayed_messages
                + attributes.not_visible_messages;
            details.push(format!(
                "{}: visible={}, delayed={}, in_flight={}, total={}",
                name,
                attributes.visible_messages,
                attributes.delayed_messages,
                attributes.not_visible_messages,
                total
            ));

            if total >= QUEUE_CRITICAL_DEPTH {
                criticals.push(format!("{name} 积压 {total} 条消息"));
            } else if total >= QUEUE_WARNING_DEPTH {
                warnings.push(format!("{name} 积压 {total} 条消息"));
            }

            if let Some(dlq_name) = attributes
                .redrive_policy
                .as_deref()
                .and_then(dead_letter_queue_name)
            {
                let dlq_url = context
                    .sqs_client
                    .resolve_queue_url(&dlq_name)
                    .await
                    .map_err(|err| format!("{name} DLQ URL 解析失败: {err}"))?;
                let dlq_attributes = context
                    .sqs_client
                    .get_queue_attributes(&dlq_url)
                    .await
                    .map_err(|err| format!("{name} DLQ 属性读取失败: {err}"))?;
                let dlq_total = dlq_attributes.visible_messages
                    + dlq_attributes.delayed_messages
                    + dlq_attributes.not_visible_messages;
                details.push(format!(
                    "{}_dlq({}): visible={}, delayed={}, in_flight={}, total={}",
                    name,
                    dlq_name,
                    dlq_attributes.visible_messages,
                    dlq_attributes.delayed_messages,
                    dlq_attributes.not_visible_messages,
                    dlq_total
                ));

                if dlq_total > 0 {
                    criticals.push(format!("{name} DLQ 有 {dlq_total} 条消息"));
                }
            } else {
                warnings.push(format!("{name} 未配置 RedrivePolicy/DLQ"));
            }
        }

        Ok::<_, String>((details, missing, warnings, criticals))
    })
    .await;

    let duration_ms = start.elapsed().as_millis() as u64;

    match res {
        Ok(Ok((details, missing, warnings, criticals))) => {
            if !missing.is_empty() {
                return HealthCheckItem {
                    id: "sqs_queue_backlog".to_string(),
                    name: "SQS 队列与 DLQ 积压".to_string(),
                    category: CheckCategory::Queues,
                    status: HealthStatus::Critical,
                    message: format!("SQS client 缺少队列配置: {}", missing.join(", ")),
                    details: Some(details.join("\n")),
                    remediation_hint: Some(
                        "检查 authentication_service 启动时是否注入 Gmail / Email 队列 URL。"
                            .to_string(),
                    ),
                    duration_ms,
                };
            }

            if !criticals.is_empty() {
                return HealthCheckItem {
                    id: "sqs_queue_backlog".to_string(),
                    name: "SQS 队列与 DLQ 积压".to_string(),
                    category: CheckCategory::Queues,
                    status: HealthStatus::Critical,
                    message: criticals.join("; "),
                    details: Some(details.join("\n")),
                    remediation_hint: Some("优先排查 pubsub workers 与对应 DLQ 消息。".to_string()),
                    duration_ms,
                };
            }

            if !warnings.is_empty() {
                return HealthCheckItem {
                    id: "sqs_queue_backlog".to_string(),
                    name: "SQS 队列与 DLQ 积压".to_string(),
                    category: CheckCategory::Queues,
                    status: HealthStatus::Warning,
                    message: warnings.join("; "),
                    details: Some(details.join("\n")),
                    remediation_hint: Some(
                        "观察 worker 消费速率，必要时扩容或检查 Gmail API 限流。".to_string(),
                    ),
                    duration_ms,
                };
            }

            HealthCheckItem {
                id: "sqs_queue_backlog".to_string(),
                name: "SQS 队列与 DLQ 积压".to_string(),
                category: CheckCategory::Queues,
                status: HealthStatus::Ok,
                message: "关键 Gmail/Email SQS 队列无异常积压，DLQ 为空".to_string(),
                details: Some(details.join("\n")),
                remediation_hint: None,
                duration_ms,
            }
        }
        Ok(Err(err)) => HealthCheckItem {
            id: "sqs_queue_backlog".to_string(),
            name: "SQS 队列与 DLQ 积压".to_string(),
            category: CheckCategory::Queues,
            status: HealthStatus::Critical,
            message: format!("SQS 队列属性读取失败: {err}"),
            details: None,
            remediation_hint: Some(
                "检查 LocalStack/AWS SQS endpoint、权限与队列 URL 配置。".to_string(),
            ),
            duration_ms,
        },
        Err(_) => HealthCheckItem {
            id: "sqs_queue_backlog".to_string(),
            name: "SQS 队列与 DLQ 积压".to_string(),
            category: CheckCategory::Queues,
            status: HealthStatus::Critical,
            message: "SQS 队列探测超时 (3s)".to_string(),
            details: None,
            remediation_hint: Some("检查 SQS endpoint 网络或队列服务负载。".to_string()),
            duration_ms,
        },
    }
}

fn dead_letter_queue_name(redrive_policy: &str) -> Option<String> {
    let value: serde_json::Value = serde_json::from_str(redrive_policy).ok()?;
    let arn = value.get("deadLetterTargetArn")?.as_str()?;
    arn.rsplit(':').next().map(str::to_string)
}

async fn probe_dss_service(context: &ApiContext) -> HealthCheckItem {
    let start = Instant::now();
    let dss_url = match self_host_service_url(
        DocumentStorageServiceUrl::new().map(|u| u.as_str().to_string()),
    ) {
        Ok(url) => url,
        Err(message) => {
            return HealthCheckItem {
                id: "dss_document_storage".to_string(),
                name: "文档存储服务 (DSS)".to_string(),
                category: CheckCategory::Dss,
                status: HealthStatus::Critical,
                message,
                details: None,
                remediation_hint: Some(
                    "请配置 OVERRIDE_DOCUMENT_STORAGE_SERVICE_URL 指向自托管 DSS 入口。"
                        .to_string(),
                ),
                duration_ms: start.elapsed().as_millis() as u64,
            };
        }
    };
    let dss_base_url = dss_url.trim_end_matches('/');
    let health_url = format!("{dss_base_url}/health");
    let internal_health_url = format!("{dss_base_url}/internal/health");

    let client = reqwest::Client::builder()
        .timeout(PROBE_TIMEOUT)
        .build()
        .unwrap_or_default();

    let res = tokio::time::timeout(PROBE_TIMEOUT, async {
        let public_resp = client
            .get(&health_url)
            .send()
            .await
            .map_err(|err| format!("DSS public /health 不可达: {err}"))?;
        if !public_resp.status().is_success() {
            return Err(format!("DSS public /health 返回 {}", public_resp.status()));
        }

        let internal_resp = client
            .get(&internal_health_url)
            .header(
                "x-document-storage-service-auth-key",
                context.internal_api_key.to_string(),
            )
            .send()
            .await
            .map_err(|err| format!("DSS internal /health 不可达: {err}"))?;
        if !internal_resp.status().is_success() {
            return Err(format!(
                "DSS internal /health 返回 {}",
                internal_resp.status()
            ));
        }

        Ok::<_, String>(())
    })
    .await;
    let duration_ms = start.elapsed().as_millis() as u64;

    match res {
        Ok(Ok(())) => HealthCheckItem {
            id: "dss_document_storage".to_string(),
            name: "文档存储服务 (DSS)".to_string(),
            category: CheckCategory::Dss,
            status: HealthStatus::Ok,
            message: "DSS public /health、internal auth 与文档 S3 bucket 均正常".to_string(),
            details: Some(format!(
                "public={health_url}\ninternal={internal_health_url}"
            )),
            remediation_hint: None,
            duration_ms,
        },
        Ok(Err(err)) => HealthCheckItem {
            id: "dss_document_storage".to_string(),
            name: "文档存储服务 (DSS)".to_string(),
            category: CheckCategory::Dss,
            status: HealthStatus::Critical,
            message: err,
            details: Some(format!(
                "public={health_url}\ninternal={internal_health_url}"
            )),
            remediation_hint: Some(
                "检查 DSS /health、S3 bucket 权限与 internal auth key 配置。".to_string(),
            ),
            duration_ms,
        },
        Err(_) => HealthCheckItem {
            id: "dss_document_storage".to_string(),
            name: "文档存储服务 (DSS)".to_string(),
            category: CheckCategory::Dss,
            status: HealthStatus::Critical,
            message: "DSS 服务探测超时 (3s)".to_string(),
            details: Some(format!(
                "public={health_url}\ninternal={internal_health_url}"
            )),
            remediation_hint: Some(
                "检查 document_storage_service 是否已启动并在监听对应端口。".to_string(),
            ),
            duration_ms,
        },
    }
}

fn self_host_public_email_url() -> Result<String, String> {
    if let Some(url) = macro_env_var::maybe_read_env("EMAIL_SERVICE_PUBLIC_URL") {
        return validate_self_host_service_url(url);
    }

    Err("缺少 EMAIL_SERVICE_PUBLIC_URL，无法验证生产公网像素追踪入口".to_string())
}

fn self_host_service_url(url: Result<String, impl std::fmt::Display>) -> Result<String, String> {
    let url = url.map_err(|err| format!("服务 URL 配置读取失败: {err}"))?;
    validate_self_host_service_url(url)
}

fn validate_self_host_service_url(url: String) -> Result<String, String> {
    if is_official_macro_cloud_url(&url) {
        return Err(format!(
            "服务 URL 指向官方 Macro 云域名，不符合自托管生产要求: {url}"
        ));
    }
    Ok(url)
}

fn sanitize_detail(value: &str) -> String {
    let mut sanitized = String::with_capacity(value.len().min(512));
    let mut current = String::new();

    for ch in value.chars() {
        if ch.is_ascii_alphanumeric() || matches!(ch, '.' | '_' | '%' | '+' | '-' | '@') {
            current.push(ch);
            continue;
        }

        flush_redacted_token(&mut sanitized, &mut current);
        sanitized.push(ch);
    }
    flush_redacted_token(&mut sanitized, &mut current);

    let sanitized = sanitized.trim();
    if sanitized.len() <= 512 {
        sanitized.to_string()
    } else {
        let truncate_at = sanitized
            .char_indices()
            .map(|(index, _)| index)
            .take_while(|index| *index <= 512)
            .last()
            .unwrap_or(0);
        format!("{}... (truncated)", &sanitized[..truncate_at])
    }
}

fn flush_redacted_token(output: &mut String, current: &mut String) {
    if current.contains('@') {
        output.push_str("[REDACTED_EMAIL]");
    } else {
        output.push_str(current);
    }
    current.clear();
}

fn is_official_macro_cloud_url(url: &str) -> bool {
    url.contains("macro.com") || url.contains("macroverse.workers.dev")
}
