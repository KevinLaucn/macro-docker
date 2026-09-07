use chrono::{DateTime, Utc};

use super::message::Message;

/// Canonical persisted metadata lazily exposed for an email thread.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EmailThreadMetadata {
    /// Database ID of the thread.
    pub thread_id: uuid::Uuid,
    /// Canonical email link that owns the thread.
    pub link_id: uuid::Uuid,
    /// Timestamp of the latest inbound message, when one exists.
    pub latest_inbound_message_ts: Option<DateTime<Utc>>,
}

/// A thread record without messages.
#[derive(Debug, Clone)]
pub struct ThreadRow {
    /// Database ID of the thread.
    pub db_id: uuid::Uuid,
    /// Provider thread ID.
    pub provider_id: Option<String>,
    /// Link ID this thread belongs to.
    pub link_id: uuid::Uuid,
    /// Whether the thread is visible in the inbox.
    pub inbox_visible: bool,
    /// Whether the thread has been read.
    pub is_read: bool,
    /// Timestamp of the latest inbound message.
    pub latest_inbound_message_ts: Option<DateTime<Utc>>,
    /// Timestamp of the latest outbound message.
    pub latest_outbound_message_ts: Option<DateTime<Utc>>,
    /// Timestamp of the latest non-spam message.
    pub latest_non_spam_message_ts: Option<DateTime<Utc>>,
    /// When the thread was created.
    pub created_at: DateTime<Utc>,
    /// When the thread was last updated.
    pub updated_at: DateTime<Utc>,
    /// The project this thread belongs to, if any.
    pub project_id: Option<String>,
    /// When the user completed the follow up on this thread.
    pub follow_up_completed_at: Option<DateTime<Utc>>,
    /// Authoritative Macro workflow completion status.
    pub workflow_done: bool,
}

/// Computes authoritative Macro email workflow completion.
/// An email workflow is done when `follow_up_completed_at` is set,
/// and is not earlier than the latest real email activity (max of inbound and outbound ts).
pub fn is_email_workflow_done(
    follow_up_completed_at: Option<DateTime<Utc>>,
    latest_inbound_message_ts: Option<DateTime<Utc>>,
    latest_outbound_message_ts: Option<DateTime<Utc>>,
) -> bool {
    match follow_up_completed_at {
        None => false,
        Some(completed_at) => {
            let latest_activity = match (latest_inbound_message_ts, latest_outbound_message_ts) {
                (Some(a), Some(b)) => Some(std::cmp::max(a, b)),
                (Some(a), None) => Some(a),
                (None, Some(b)) => Some(b),
                (None, None) => None,
            };

            latest_activity
                .map(|activity| completed_at >= activity)
                .unwrap_or(true)
        }
    }
}

/// A fully assembled email thread with paginated messages.
#[derive(Debug, Clone)]
pub struct Thread {
    /// The thread metadata.
    pub row: ThreadRow,
    /// Paginated messages in the thread.
    pub messages: Vec<Message>,
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::{Duration, TimeZone, Utc};

    #[test]
    fn test_workflow_done_cases_a_through_i() {
        let t1 = Utc.with_ymd_and_hms(2026, 9, 1, 10, 0, 0).unwrap();
        let t2 = t1 + Duration::hours(1);
        let t3 = t2 + Duration::hours(1);
        let t4 = t3 + Duration::hours(1);
        let t5 = t4 + Duration::hours(1);

        // Case A: 正常 inbound，未完成
        // completed = None, latest_inbound = T1 => workflow_done = false
        assert!(!is_email_workflow_done(None, Some(t1), None));

        // Case B: Mark Done
        // completed = T2 (T2 > T1) => workflow_done = true
        assert!(is_email_workflow_done(Some(t2), Some(t1), None));

        // Case C: Done 后 outbound
        // completed = T2, latest_outbound = T3 (T3 > T2) => workflow_done = false
        assert!(!is_email_workflow_done(Some(t2), Some(t1), Some(t3)));

        // Case D: 再次 Done
        // completed = T4 (T4 > T3) => workflow_done = true
        assert!(is_email_workflow_done(Some(t4), Some(t1), Some(t3)));

        // Case E: 新 inbound
        // latest_inbound = T5 (T5 > T4) => workflow_done = false
        assert!(!is_email_workflow_done(Some(t4), Some(t5), Some(t3)));

        // Case F: send-only Mark Done
        // latest_inbound = None, latest_outbound = T1, completed = T2 (T2 > T1) => workflow_done = true
        assert!(is_email_workflow_done(Some(t2), None, Some(t1)));

        // Case G: send-only Mark Not Done
        // completed = None => workflow_done = false
        assert!(!is_email_workflow_done(None, None, Some(t1)));

        // Case H: 无 activity timestamp
        // latest_inbound = None, latest_outbound = None, completed = T1 => workflow_done = true
        assert!(is_email_workflow_done(Some(t1), None, None));

        // Case I: updated_at 变化不影响 workflow_done（验证接口设计和时间戳逻辑排除 updated_at）
        // 只要 completed >= max(inbound, outbound)，无论外部更新时间是多少，workflow_done 恒为 true
        assert!(is_email_workflow_done(Some(t2), Some(t1), None));
    }
}
