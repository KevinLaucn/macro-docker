-- Adds the follow_up_completed_at timestamp to email_threads for Macro email workflow completion.
-- Nullable without default: historical threads remain NULL (uncompleted in Macro workflow), avoiding accidental bulk completion.
ALTER TABLE email_threads
    ADD COLUMN IF NOT EXISTS follow_up_completed_at TIMESTAMPTZ;
