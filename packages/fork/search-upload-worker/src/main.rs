use std::sync::Arc;
use std::time::Duration;

use anyhow::Context as _;
use aws_sdk_sqs::types::Message;
use document_storage_service_client::DocumentStorageServiceClient;
use macro_entrypoint::MacroEntrypoint;
use macro_env_var::{env_vars, maybe_env_vars};
use macro_service_urls::DocumentStorageServiceUrl;
use s3_key::DocumentKey;
use serde::Deserialize;
use tracing;

const LOCALSTACK_ACCOUNT_ID: &str = "000000000000";
const QUEUE_NAME: &str = "search-upload-queue";

env_vars! {
    struct DocumentStorageServiceAuthKey;
}

maybe_env_vars! {
    struct SearchUploadQueueUrl;
    struct LocalAwsUrl;
}

#[tokio::main]
async fn main() -> Result<(), anyhow::Error> {
    MacroEntrypoint::default().init();
    tracing::info!("initiating local search upload worker");

    let dss_url = DocumentStorageServiceUrl::new()?.to_string();
    let dss_auth_key = DocumentStorageServiceAuthKey::new()
        .context("DOCUMENT_STORAGE_SERVICE_AUTH_KEY must be provided")?
        .to_string();
    let dss_client = Arc::new(DocumentStorageServiceClient::new(dss_auth_key, dss_url));

    let queue_url = SearchUploadQueueUrl::new()
        .map(|queue_url| queue_url.to_string())
        .unwrap_or_else(default_queue_url);

    let sqs_client = aws_sdk_sqs::Client::new(&macro_aws_config::get_macro_aws_config().await);

    poll_forever(dss_client, sqs_client, queue_url).await
}

fn default_queue_url() -> String {
    let local_aws_url = LocalAwsUrl::new()
        .map(|local_aws_url| local_aws_url.to_string())
        .unwrap_or_else(|| "http://localstack:4566".to_string());
    format!(
        "{}/{LOCALSTACK_ACCOUNT_ID}/{QUEUE_NAME}",
        local_aws_url.trim_end_matches('/')
    )
}

async fn poll_forever(
    dss_client: Arc<DocumentStorageServiceClient>,
    sqs_client: aws_sdk_sqs::Client,
    queue_url: String,
) -> Result<(), anyhow::Error> {
    loop {
        let response = match sqs_client
            .receive_message()
            .queue_url(&queue_url)
            .wait_time_seconds(20)
            .max_number_of_messages(10)
            .send()
            .await
        {
            Ok(response) => response,
            Err(error) => {
                tracing::warn!(error=?error, %queue_url, "failed to poll search upload queue");
                tokio::time::sleep(Duration::from_secs(5)).await;
                continue;
            }
        };

        for message in response.messages.unwrap_or_default() {
            let processed = handle_message(dss_client.clone(), &message).await;

            match processed {
                Ok(()) => delete_message(&sqs_client, &queue_url, &message).await,
                Err(error) => {
                    tracing::error!(error=?error, "failed to process search upload message; leaving it on queue");
                }
            }
        }
    }
}

async fn delete_message(sqs_client: &aws_sdk_sqs::Client, queue_url: &str, message: &Message) {
    let Some(receipt_handle) = &message.receipt_handle else {
        tracing::warn!(?message, "processed SQS message had no receipt handle");
        return;
    };

    if let Err(error) = sqs_client
        .delete_message()
        .queue_url(queue_url)
        .receipt_handle(receipt_handle)
        .send()
        .await
    {
        tracing::error!(error=?error, "failed to delete processed search upload message");
    }
}

async fn handle_message(
    dss_client: Arc<DocumentStorageServiceClient>,
    message: &Message,
) -> Result<(), anyhow::Error> {
    let Some(body) = &message.body else {
        tracing::warn!(?message, "search upload SQS message had no body");
        return Ok(());
    };

    let keys = match object_created_keys_from_body(body) {
        Ok(keys) => keys,
        Err(error) => {
            tracing::warn!(error=?error, body, "discarding malformed search upload SQS message");
            return Ok(());
        }
    };

    for key in keys {
        process_s3_object_key(&dss_client, &key)
            .await
            .with_context(|| format!("failed to process search upload for s3 key {key}"))?;
    }

    Ok(())
}

/// Processes an S3 object key notification and notifies the document storage
/// service to index document content if applicable.
pub async fn process_s3_object_key(
    dss_client: &DocumentStorageServiceClient,
    key: &str,
) -> Result<(), anyhow::Error> {
    let document_key = match DocumentKey::from_s3_key(key) {
        Ok(key) => key,
        Err(e) => {
            tracing::warn!(error=?e, key=%key, "unable to parse key");
            return Ok(());
        }
    };

    if document_key.is_temp()
        || document_key.is_bom_part()
        || document_key.is_sync_service_snapshot()
    {
        tracing::trace!("skipping non-document key");
        return Ok(());
    }

    let document_id = match document_key.document_id() {
        Some(id) => id,
        None => {
            tracing::warn!(?document_key, "document key has no id");
            return Ok(());
        }
    };

    tracing::trace!(?document_key, "processing document key");

    let document_basic = dss_client
        .get_document_basic(document_id)
        .await
        .context("Failed to fetch document basic info")?
        .ok_or_else(|| anyhow::anyhow!("document not found"))?;

    let file_type = match document_basic.try_file_type() {
        Some(file_type) => file_type,
        None => {
            tracing::trace!(document_id=?document_id, "no file type found");
            return Ok(());
        }
    };

    let document_version_id = document_key.version_id_string();
    dss_client
        .publish_document_content_uploaded(document_id, file_type, document_version_id)
        .await?;

    tracing::info!(document_id, "relayed document content upload");

    Ok(())
}

/// Parse S3 event-notification JSON into decoded object keys.
pub fn object_created_keys_from_body(body: &str) -> Result<Vec<String>, serde_json::Error> {
    let event = serde_json::from_str::<S3EventNotification>(body)?;

    Ok(event
        .records
        .into_iter()
        .filter(|record| is_object_created_event(&record.event_name))
        .map(|record| decode_s3_event_key(&record.s3.object.key))
        .collect())
}

fn is_object_created_event(event_name: &str) -> bool {
    event_name.starts_with("ObjectCreated:") || event_name.starts_with("s3:ObjectCreated:")
}

fn decode_s3_event_key(key: &str) -> String {
    let form_encoded = key.replace('+', " ");
    urlencoding::decode(&form_encoded)
        .map(|decoded| decoded.into_owned())
        .unwrap_or_else(|error| {
            tracing::warn!(%key, error=?error, "failed to URL-decode S3 event key; using raw key");
            key.to_string()
        })
}

#[derive(Deserialize)]
struct S3EventNotification {
    #[serde(rename = "Records")]
    records: Vec<S3EventRecord>,
}

#[derive(Deserialize)]
struct S3EventRecord {
    #[serde(rename = "eventName")]
    event_name: String,
    s3: S3Entity,
}

#[derive(Deserialize)]
struct S3Entity {
    object: S3Object,
}

#[derive(Deserialize)]
struct S3Object {
    key: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_s3_notification_body() {
        let sample = r#"{
            "Records": [
                {
                    "eventName": "ObjectCreated:Put",
                    "s3": {
                        "object": {
                            "key": "v1%2Forganizations%2Forg-1%2Fdocuments%2Fdoc-1%2Fversions%2Fv1"
                        }
                    }
                },
                {
                    "eventName": "ObjectRemoved:Delete",
                    "s3": {
                        "object": {
                            "key": "other-key"
                        }
                    }
                }
            ]
        }"#;

        let keys = object_created_keys_from_body(sample).unwrap();
        assert_eq!(
            keys,
            vec!["v1/organizations/org-1/documents/doc-1/versions/v1"]
        );
    }
}
