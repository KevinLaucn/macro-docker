//! Generic SQS transport operations shared by queue-specific adapters.

use crate::SQS;
use std::collections::HashMap;

/// Raw message returned from an SQS receive operation.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ReceivedMessage {
    /// Queue-assigned message identifier, when present.
    pub message_id: Option<String>,
    /// Unparsed message body, when present.
    pub body: Option<String>,
    /// Receipt handle used to delete or delay the message, when present.
    pub receipt_handle: Option<String>,
}

/// Lightweight queue-depth diagnostics for health checks.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct QueueAttributes {
    pub visible_messages: i64,
    pub delayed_messages: i64,
    pub not_visible_messages: i64,
    pub redrive_policy: Option<String>,
}

impl SQS {
    /// Read queue depth attributes without receiving or mutating messages.
    pub async fn get_queue_attributes(&self, queue_url: &str) -> anyhow::Result<QueueAttributes> {
        let queue_url = self.resolve_queue_url(queue_url).await?;
        let output = self
            .inner
            .get_queue_attributes()
            .queue_url(queue_url)
            .attribute_names(aws_sdk_sqs::types::QueueAttributeName::ApproximateNumberOfMessages)
            .attribute_names(
                aws_sdk_sqs::types::QueueAttributeName::ApproximateNumberOfMessagesDelayed,
            )
            .attribute_names(
                aws_sdk_sqs::types::QueueAttributeName::ApproximateNumberOfMessagesNotVisible,
            )
            .attribute_names(aws_sdk_sqs::types::QueueAttributeName::RedrivePolicy)
            .send()
            .await?;

        Ok(QueueAttributes::from(output.attributes.unwrap_or_default()))
    }

    /// Resolve either a full SQS URL or a queue name into a queue URL.
    pub async fn resolve_queue_url(&self, queue: &str) -> anyhow::Result<String> {
        if queue.starts_with("http://") || queue.starts_with("https://") {
            return Ok(queue.to_string());
        }

        let output = self.inner.get_queue_url().queue_name(queue).send().await?;
        output
            .queue_url
            .ok_or_else(|| anyhow::anyhow!("SQS returned no queue URL for {queue}"))
    }

    /// Send one message to a FIFO queue.
    pub async fn send_fifo_message(
        &self,
        queue_url: &str,
        message_body: String,
        message_group_id: String,
        message_deduplication_id: String,
    ) -> anyhow::Result<()> {
        self.inner
            .send_message()
            .queue_url(queue_url)
            .message_body(message_body)
            .message_group_id(message_group_id)
            .message_deduplication_id(message_deduplication_id)
            .send()
            .await?;

        Ok(())
    }

    /// Receive a batch of unparsed messages from a queue.
    pub async fn receive_messages(
        &self,
        queue_url: &str,
        max_number_of_messages: i32,
        wait_time_seconds: i32,
    ) -> anyhow::Result<Vec<ReceivedMessage>> {
        let output = self
            .inner
            .receive_message()
            .queue_url(queue_url)
            .max_number_of_messages(max_number_of_messages)
            .wait_time_seconds(wait_time_seconds)
            .send()
            .await?;

        Ok(output
            .messages
            .unwrap_or_default()
            .into_iter()
            .map(|message| ReceivedMessage {
                message_id: message.message_id,
                body: message.body,
                receipt_handle: message.receipt_handle,
            })
            .collect())
    }

    /// Delete a message from a queue using its receipt handle.
    pub async fn delete_message(
        &self,
        queue_url: &str,
        receipt_handle: &str,
    ) -> anyhow::Result<()> {
        self.inner
            .delete_message()
            .queue_url(queue_url)
            .receipt_handle(receipt_handle)
            .send()
            .await?;

        Ok(())
    }

    /// Change the visibility timeout for a received message.
    pub async fn change_message_visibility(
        &self,
        queue_url: &str,
        receipt_handle: &str,
        visibility_timeout: i32,
    ) -> anyhow::Result<()> {
        self.inner
            .change_message_visibility()
            .queue_url(queue_url)
            .receipt_handle(receipt_handle)
            .visibility_timeout(visibility_timeout)
            .send()
            .await?;

        Ok(())
    }
}

impl From<HashMap<aws_sdk_sqs::types::QueueAttributeName, String>> for QueueAttributes {
    fn from(attributes: HashMap<aws_sdk_sqs::types::QueueAttributeName, String>) -> Self {
        let read = |name: aws_sdk_sqs::types::QueueAttributeName| {
            attributes
                .get(&name)
                .and_then(|value| value.parse::<i64>().ok())
                .unwrap_or_default()
        };

        Self {
            visible_messages: read(
                aws_sdk_sqs::types::QueueAttributeName::ApproximateNumberOfMessages,
            ),
            delayed_messages: read(
                aws_sdk_sqs::types::QueueAttributeName::ApproximateNumberOfMessagesDelayed,
            ),
            not_visible_messages: read(
                aws_sdk_sqs::types::QueueAttributeName::ApproximateNumberOfMessagesNotVisible,
            ),
            redrive_policy: attributes
                .get(&aws_sdk_sqs::types::QueueAttributeName::RedrivePolicy)
                .cloned(),
        }
    }
}
