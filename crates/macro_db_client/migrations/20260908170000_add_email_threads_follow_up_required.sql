-- Adds the follow_up_required flag to email_threads.
-- When a user sends/replies to an email thread, follow_up_required is set to true,
-- guaranteeing that the thread qualifies for the Important/Follow-up workflow even if is_signal was false.
ALTER TABLE email_threads
    ADD COLUMN IF NOT EXISTS follow_up_required boolean NOT NULL DEFAULT false;

-- Partial index for fast lookup of threads requiring follow-up in important/follow-up feeds
CREATE INDEX IF NOT EXISTS idx_email_threads_follow_up_required
    ON email_threads (link_id, (COALESCE(latest_inbound_message_ts, latest_outbound_message_ts, updated_at)) DESC, id DESC)
    WHERE follow_up_required = true;
