use crate::outbound::email_api::GmailApi;
use email_api_client::domain::models::TokenFreshness;
use models_email::gmail::inbox_sync::{
    GmailMessagePayload, InboxSyncOperation, InboxSyncPubsubMessage,
};
use sqlx::PgPool;
use std::time::Duration;
use tokio_util::sync::CancellationToken;

const POLL_INTERVAL: Duration = Duration::from_secs(15);

/// Background polling loop for local development.
///
/// In production, Gmail changes trigger Google Pub/Sub push webhooks.
/// In local environments without a public webhook endpoint, this task periodically
/// checks each active Gmail link for an advanced `historyId` and enqueues an inbox
/// sync notification so new emails arrive automatically.
#[tracing::instrument(skip(db, email_api, sqs_client, cancellation_token))]
pub async fn run_local_poller(
    db: PgPool,
    email_api: GmailApi,
    sqs_client: sqs_client::SQS,
    cancellation_token: CancellationToken,
) {
    tracing::info!(
        "Starting local development Gmail poller (interval: {:?})",
        POLL_INTERVAL
    );

    let mut interval = tokio::time::interval(POLL_INTERVAL);
    interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);

    loop {
        tokio::select! {
            _ = cancellation_token.cancelled() => {
                tracing::info!("Local Gmail poller cancelled");
                break;
            }
            _ = interval.tick() => {
                if let Err(error) = poll_active_links(&db, &email_api, &sqs_client).await {
                    tracing::warn!(error = ?error, "Local Gmail poller cycle encountered an error");
                }
            }
        }
    }
}

async fn poll_active_links(
    db: &PgPool,
    email_api: &GmailApi,
    sqs_client: &sqs_client::SQS,
) -> anyhow::Result<()> {
    // Query active Gmail links using dynamic sqlx::query_as to avoid requiring .sqlx offline updates
    #[derive(sqlx::FromRow)]
    struct ActiveLinkRow {
        id: uuid::Uuid,
        email_address: String,
        db_history_id: Option<String>,
    }

    let active_links: Vec<ActiveLinkRow> = sqlx::query_as(
        r#"
        SELECT l.id, l.email_address, gh.history_id as db_history_id
        FROM email_links l
        LEFT JOIN email_gmail_histories gh ON l.id = gh.link_id
        WHERE l.is_sync_active = true
          AND l.needs_reauth = false
          AND l.provider = 'GMAIL'
        "#,
    )
    .fetch_all(db)
    .await?;

    for link in active_links {
        let Some(db_history_str) = link.db_history_id else {
            // If the link has never completed initial sync, skip polling
            continue;
        };

        let Ok(db_history_u64) = db_history_str.parse::<u64>() else {
            continue;
        };

        // Query remote Gmail profile to get latest historyId
        let remote_history_id = match email_api
            .get_access_token(link.id, TokenFreshness::Cached)
            .await
        {
            Ok(access_token) => {
                let client = reqwest::Client::new();
                let res = client
                    .get("https://gmail.googleapis.com/gmail/v1/users/me/profile")
                    .bearer_auth(access_token.expose_secret())
                    .send()
                    .await;

                match res {
                    Ok(resp) if resp.status().is_success() => {
                        match resp.json::<models_email::gmail::GmailUserProfile>().await {
                            Ok(profile) => profile.history_id.parse::<u64>().ok(),
                            Err(_) => None,
                        }
                    }
                    _ => None,
                }
            }
            Err(e) => {
                tracing::debug!(link_id = %link.id, error = ?e, "Failed to get access token for local polling");
                None
            }
        };

        if let Some(remote_u64) = remote_history_id {
            if remote_u64 > db_history_u64 {
                tracing::info!(
                    link_id = %link.id,
                    email = %link.email_address,
                    db_history = db_history_u64,
                    remote_history = remote_u64,
                    "Detected new Gmail activity in local poller, enqueuing inbox sync"
                );

                let message = InboxSyncPubsubMessage {
                    link_id: link.id,
                    operation: InboxSyncOperation::GmailMessage(GmailMessagePayload {
                        history_id: remote_u64,
                    }),
                };

                if let Err(e) = sqs_client
                    .enqueue_gmail_inbox_sync_notification(message)
                    .await
                {
                    tracing::error!(error = ?e, "Local poller failed to enqueue inbox sync notification");
                }
            }
        }
    }

    Ok(())
}
