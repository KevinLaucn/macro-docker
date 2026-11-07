-- Fork-owned persistent storage for AI email translations (EMAIL-TRANSLATION-001).
-- Preserves translated message bodies, replyless bodies, plain text, thread subjects,
-- and list summaries keyed by user permission scope, target language, content type,
-- and server-computed stable source_hash.

CREATE TABLE IF NOT EXISTS email_translations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_scope TEXT NOT NULL,
    link_id UUID NOT NULL REFERENCES email_links(id) ON DELETE CASCADE,
    thread_id UUID NOT NULL REFERENCES email_threads(id) ON DELETE CASCADE,
    message_id UUID REFERENCES email_messages(id) ON DELETE CASCADE,
    target_id TEXT NOT NULL,
    content_type TEXT NOT NULL CHECK (content_type IN ('message', 'thread_title', 'thread_summary')),
    target_lang TEXT NOT NULL,
    source_hash TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('translated', 'partial')),
    translated_html TEXT,
    translated_replyless_html TEXT,
    translated_text TEXT,
    translated_subject TEXT,
    translated_snippet TEXT,
    segments_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    model TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT email_translations_scope_unique
        UNIQUE (owner_scope, content_type, target_id, target_lang, source_hash)
);

CREATE INDEX IF NOT EXISTS email_translations_owner_thread_lang_idx
    ON email_translations (owner_scope, thread_id, target_lang, updated_at DESC);

CREATE INDEX IF NOT EXISTS email_translations_owner_message_lang_idx
    ON email_translations (owner_scope, message_id, target_lang, updated_at DESC)
    WHERE message_id IS NOT NULL;
