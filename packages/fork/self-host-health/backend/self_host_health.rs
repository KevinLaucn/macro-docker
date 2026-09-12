pub mod probes;
mod service;
pub mod types;

pub use service::router;

pub fn gmail_probe_queues() -> (
    macro_queues::GmailInboxSyncQueue,
    macro_queues::GmailInboxSyncRetryQueue,
    macro_queues::GmailOpsQueue,
    macro_queues::GmailOpsRetryQueue,
) {
    (
        macro_queues::GmailInboxSyncQueue::new(),
        macro_queues::GmailInboxSyncRetryQueue::new(),
        macro_queues::GmailOpsQueue::new(),
        macro_queues::GmailOpsRetryQueue::new(),
    )
}
