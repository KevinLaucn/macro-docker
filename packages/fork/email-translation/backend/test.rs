use super::hash::{compute_message_source_hash, normalize_ephemeral_url};
use super::repo::{
    AuthoritativeEmailMessage, AuthoritativeEmailThreadSummary, EmailTranslationStore,
    PersistedTranslationRow, PgEmailTranslationStore, TranslationStoreError,
    UpsertTranslationInput,
};
use super::segmenter::{
    extract_html_template, extract_text_template, protect_tokens, restore_protected_tokens,
};
use super::service::{
    EmailTranslationService, ThreadContentType, TranslationAction, TranslationServiceError,
};
use crate::cognition::service::structured_completion::{
    ToolFreeCompletion, ToolFreeCompletionError, ToolFreeRequest,
};
use ai_billing::{AiAdmissionError, AiAdmissionService, DenyReason};
use ai_usage::AiFeature;
use async_trait::async_trait;
use chrono::Utc;
use macro_db_migrator::MACRO_DB_MIGRATIONS;
use macro_user_id::user_id::MacroUserIdStr;
use serde_json::Value;
use sqlx::{Pool, Postgres};
use std::collections::HashMap;
use std::sync::{
    Arc, Mutex,
    atomic::{AtomicUsize, Ordering},
};
use uuid::Uuid;

struct MockCompletion {
    calls: AtomicUsize,
    fail_all: bool,
    omit_segment_ids: Mutex<Vec<String>>,
    last_requested_ids: Mutex<Vec<Vec<String>>>,
    delay_ms: u64,
}

impl MockCompletion {
    fn new() -> Arc<Self> {
        Arc::new(Self {
            calls: AtomicUsize::new(0),
            fail_all: false,
            omit_segment_ids: Mutex::new(Vec::new()),
            last_requested_ids: Mutex::new(Vec::new()),
            delay_ms: 0,
        })
    }

    fn call_count(&self) -> usize {
        self.calls.load(Ordering::SeqCst)
    }
}

#[async_trait]
impl ToolFreeCompletion for MockCompletion {
    async fn complete(
        &self,
        _owner: MacroUserIdStr<'static>,
        request: ToolFreeRequest,
    ) -> Result<Value, ToolFreeCompletionError> {
        self.calls.fetch_add(1, Ordering::SeqCst);
        if self.delay_ms > 0 {
            tokio::time::sleep(std::time::Duration::from_millis(self.delay_ms)).await;
        }
        if self.fail_all {
            return Err(ToolFreeCompletionError::Busy);
        }

        let input: Value = serde_json::from_str(&request.prompt)
            .map_err(|e| ToolFreeCompletionError::Failed(e.into()))?;
        let target_lang = input["target_language"].as_str().unwrap_or("zh-CN");
        let segments = input["segments"].as_array().cloned().unwrap_or_default();

        let omit = self.omit_segment_ids.lock().unwrap().clone();
        let mut req_ids = Vec::new();
        let mut out_items = Vec::new();

        for seg in segments {
            let id = seg["id"].as_str().unwrap_or_default().to_owned();
            let text = seg["text"].as_str().unwrap_or_default();
            req_ids.push(id.clone());
            if omit.contains(&id) {
                continue;
            }
            out_items.push(serde_json::json!({
                "id": id,
                "text": format!("[{target_lang}] {text}"),
            }));
        }

        self.last_requested_ids.lock().unwrap().push(req_ids);

        Ok(serde_json::json!({
            "translations": out_items,
        }))
    }
}

struct MockAdmission {
    allow: Mutex<bool>,
}

impl MockAdmission {
    fn allowing() -> Arc<Self> {
        Arc::new(Self {
            allow: Mutex::new(true),
        })
    }

    fn set_allow(&self, allow: bool) {
        *self.allow.lock().unwrap() = allow;
    }
}

impl AiAdmissionService for MockAdmission {
    fn admit<'a>(
        &'a self,
        _user: &'a MacroUserIdStr<'_>,
        _feature: AiFeature,
    ) -> ai_billing::domain::admission::AdmissionFuture<'a> {
        let allow = *self.allow.lock().unwrap();
        Box::pin(async move {
            if allow {
                Ok(())
            } else {
                Err(AiAdmissionError::Denied(DenyReason::AllowanceExhausted))
            }
        })
    }
}

#[derive(Default)]
struct InMemoryTranslationStore {
    messages: Mutex<HashMap<Uuid, (String, AuthoritativeEmailMessage)>>,
    threads: Mutex<HashMap<Uuid, (String, AuthoritativeEmailThreadSummary)>>,
    rows: Mutex<HashMap<String, PersistedTranslationRow>>,
    fail_upsert: Mutex<bool>,
}

impl InMemoryTranslationStore {
    fn new() -> Arc<Self> {
        Arc::new(Self::default())
    }

    fn put_message(&self, owner: &str, msg: AuthoritativeEmailMessage) {
        self.messages
            .lock()
            .unwrap()
            .insert(msg.message_id, (owner.to_ascii_lowercase(), msg));
    }

    fn put_thread(&self, owner: &str, thread: AuthoritativeEmailThreadSummary) {
        self.threads
            .lock()
            .unwrap()
            .insert(thread.thread_id, (owner.to_ascii_lowercase(), thread));
    }

    fn row_key(
        owner_scope: &str,
        content_type: &str,
        target_id: &str,
        target_lang: &str,
        source_hash: &str,
    ) -> String {
        format!("{owner_scope}|{content_type}|{target_id}|{target_lang}|{source_hash}")
    }
}

#[async_trait]
impl EmailTranslationStore for InMemoryTranslationStore {
    async fn load_authorized_message(
        &self,
        user_id: &MacroUserIdStr<'static>,
        _org_id: Option<i64>,
        message_id: Uuid,
    ) -> Result<AuthoritativeEmailMessage, TranslationStoreError> {
        let map = self.messages.lock().unwrap();
        let (owner, msg) = map.get(&message_id).ok_or(TranslationStoreError::NotFound)?;
        if !owner.eq_ignore_ascii_case(user_id.as_ref()) {
            return Err(TranslationStoreError::Forbidden);
        }
        Ok(msg.clone())
    }

    async fn load_authorized_thread(
        &self,
        user_id: &MacroUserIdStr<'static>,
        _org_id: Option<i64>,
        thread_id: Uuid,
    ) -> Result<AuthoritativeEmailThreadSummary, TranslationStoreError> {
        let map = self.threads.lock().unwrap();
        let (owner, thread) = map.get(&thread_id).ok_or(TranslationStoreError::NotFound)?;
        if !owner.eq_ignore_ascii_case(user_id.as_ref()) {
            return Err(TranslationStoreError::Forbidden);
        }
        Ok(thread.clone())
    }

    async fn get_translation(
        &self,
        owner_scope: &str,
        content_type: &str,
        target_id: &str,
        target_lang: &str,
        source_hash: &str,
    ) -> Result<Option<PersistedTranslationRow>, TranslationStoreError> {
        let key = Self::row_key(owner_scope, content_type, target_id, target_lang, source_hash);
        Ok(self.rows.lock().unwrap().get(&key).cloned())
    }

    async fn upsert_translation(
        &self,
        input: UpsertTranslationInput,
    ) -> Result<PersistedTranslationRow, TranslationStoreError> {
        if *self.fail_upsert.lock().unwrap() {
            return Err(TranslationStoreError::Database(anyhow::anyhow!(
                "simulated database write failure"
            )));
        }
        let key = Self::row_key(
            &input.owner_scope,
            &input.content_type,
            &input.target_id,
            &input.target_lang,
            &input.source_hash,
        );
        let now = Utc::now();
        let row = PersistedTranslationRow {
            id: Uuid::new_v4(),
            owner_scope: input.owner_scope,
            link_id: input.link_id,
            thread_id: input.thread_id,
            message_id: input.message_id,
            target_id: input.target_id,
            content_type: input.content_type,
            target_lang: input.target_lang,
            source_hash: input.source_hash,
            status: input.status,
            translated_html: input.translated_html,
            translated_replyless_html: input.translated_replyless_html,
            translated_text: input.translated_text,
            translated_subject: input.translated_subject,
            translated_snippet: input.translated_snippet,
            segments_json: input.segments_json,
            model: input.model,
            created_at: now,
            updated_at: now,
        };
        self.rows.lock().unwrap().insert(key, row.clone());
        Ok(row)
    }
}

#[test]
fn source_hash_ignores_tracking_pixels_and_ephemeral_signed_urls() {
    let url_v1 = "https://s3.example.com/file.png?id=42&X-Amz-Date=20261106T000000Z&X-Amz-Signature=abc111&X-Amz-Expires=300";
    let url_v2 = "https://s3.example.com/file.png?id=42&X-Amz-Date=20261107T120000Z&X-Amz-Signature=def999&token=temp";
    assert_eq!(
        normalize_ephemeral_url(url_v1),
        "https://s3.example.com/file.png?id=42"
    );
    assert_eq!(
        normalize_ephemeral_url(url_v1),
        normalize_ephemeral_url(url_v2)
    );

    let html_with_fork_pixel = format!(
        r#"<div>Hello world<img src="https://mail.example.com/t/o/11111111-2222-3333-4444-555555555555" width="1" height="1"><img src="{url_v1}"></div>"#
    );
    let html_with_official_pixel = format!(
        r#"<div>Hello world<img src="https://mail.example.com/opens/tok_abc" width="1" height="1"/><img src="{url_v2}"></div>"#
    );

    let hash_a = compute_message_source_hash(
        Some("Subject"),
        Some("Snippet"),
        Some(&html_with_fork_pixel),
        None,
        Some("Hello world"),
        None,
    );
    let hash_b = compute_message_source_hash(
        Some("Subject"),
        Some("Snippet"),
        Some(&html_with_official_pixel),
        None,
        Some("Hello world\r\n"),
        None,
    );
    assert_eq!(hash_a, hash_b);

    let hash_changed = compute_message_source_hash(
        Some("Subject"),
        Some("Snippet"),
        Some("<div>Updated body text</div>"),
        None,
        Some("Updated body text"),
        None,
    );
    assert_ne!(hash_a, hash_changed);
}

#[test]
fn html_template_preserves_structure_and_protects_tokens_and_escapes_injected_html() {
    let html = r#"<table><tr><td>Order #ORD-2026-889 for billing@example.com costs $1,250.00 (5 pcs).</td></tr></table><blockquote>Quoted line<br><a href="https://example.com/pay">Pay here</a><img src="cid:logo_123@macro"></blockquote><img src="https://api.example.com/t/o/pixel-123"><img src="https://api.example.com/opens/pixel-456">"#;

    let tpl = extract_html_template(html, "h", true);
    assert_eq!(tpl.segments.len(), 3);

    // First segment should protect #ORD-2026-889, billing@example.com, $1,250.00, 5 pcs
    let seg0 = &tpl.segments[0];
    assert!(seg0.masked_text.contains("⟦P0⟧"));
    assert!(seg0.masked_text.contains("⟦P1⟧"));
    assert!(seg0.masked_text.contains("⟦P2⟧"));
    assert!(seg0.masked_text.contains("⟦P3⟧"));

    let mut translations = HashMap::new();
    for seg in &tpl.segments {
        let fake_model_out = format!("译: {} <script>alert(1)</script>", seg.masked_text);
        let restored = restore_protected_tokens(&fake_model_out, &seg.tokens)
            .expect("tokens should validate and restore");
        translations.insert(seg.id.clone(), restored);
    }

    let rendered = tpl.render(&translations);
    assert!(rendered.contains("<table><tr><td>"));
    assert!(rendered.contains("#ORD-2026-889"));
    assert!(rendered.contains("billing@example.com"));
    assert!(rendered.contains("$1,250.00"));
    assert!(rendered.contains("5 pcs"));
    assert!(rendered.contains(r#"<img src="cid:logo_123@macro">"#));
    assert!(rendered.contains(r#"<a href="https://example.com/pay">"#));
    assert!(!rendered.contains("/t/o/"));
    assert!(!rendered.contains("/opens/"));
    assert!(!rendered.contains("<script>"));
    assert!(rendered.contains("&lt;script&gt;alert(1)&lt;/script&gt;"));

    // Recipient copy (`strip_pixels = false`) preserves pixel for legitimate recipient open tracking
    let recipient_tpl = extract_html_template(html, "h", false);
    let recipient_rendered = recipient_tpl.render(&translations);
    assert!(recipient_rendered.contains("/t/o/pixel-123"));
    assert!(recipient_rendered.contains("/opens/pixel-456"));
}

#[test]
fn plain_text_template_preserves_newlines_and_quotes() {
    let text = "First line with https://macro.com/docs\n> Quoted reply for user@macro.com\n\nThird line";
    let tpl = extract_text_template(text, "t");
    assert_eq!(tpl.segments.len(), 3);

    let mut map = HashMap::new();
    for seg in &tpl.segments {
        let restored = restore_protected_tokens(&format!("ZH({})", seg.masked_text), &seg.tokens)
            .expect("tokens restored");
        map.insert(seg.id.clone(), restored);
    }
    let out = tpl.render(&map);
    assert_eq!(
        out,
        "ZH(First line with https://macro.com/docs)\n> ZH(Quoted reply for user@macro.com)\n\nZH(Third line)"
    );
}

#[test]
fn token_restoration_rejects_missing_or_hallucinated_placeholders() {
    let (masked, tokens) = protect_tokens("Contact support@example.com for #INV-1001");
    assert_eq!(tokens.len(), 2);
    assert!(restore_protected_tokens(&masked, &tokens).is_some());
    assert!(restore_protected_tokens("Missing token ⟦P0⟧ only", &tokens).is_none());
    assert!(
        restore_protected_tokens(&format!("{masked} plus ⟦P99⟧"), &tokens).is_none()
    );
}

#[tokio::test]
async fn service_persists_reuses_cache_without_ai_and_isolates_languages_and_permissions() {
    let store = InMemoryTranslationStore::new();
    let completion = MockCompletion::new();
    let admission = MockAdmission::allowing();
    let service = EmailTranslationService::new(store.clone(), completion.clone(), admission.clone());

    let owner = MacroUserIdStr::parse_from_str("macro|owner@example.com").unwrap();
    let other_user = MacroUserIdStr::parse_from_str("macro|intruder@example.com").unwrap();
    let msg_id = Uuid::new_v4();
    let thread_id = Uuid::new_v4();
    let link_id = Uuid::new_v4();

    store.put_message(
        owner.as_ref(),
        AuthoritativeEmailMessage {
            message_id: msg_id,
            thread_id,
            link_id,
            is_sent: true,
            is_draft: false,
            subject: Some("Quarterly Update".to_owned()),
            snippet: Some("Revenue reached $50,000".to_owned()),
            body_html_sanitized: Some(
                r#"<p>Revenue reached $50,000.</p><img src="https://api.example.com/t/o/own-pixel">"#
                    .to_owned(),
            ),
            body_replyless: Some(r#"<p>Revenue reached $50,000.</p>"#.to_owned()),
            body_text: Some("Revenue reached $50,000.".to_owned()),
            body_macro: None,
        },
    );

    // 1. Prefetch before translation returns status = "none" with 0 AI calls
    let pre = service
        .process_message(&owner, None, msg_id, "zh-CN", TranslationAction::Get)
        .await
        .expect("prefetch should succeed");
    assert_eq!(pre.status, "none");
    assert!(!pre.saved);
    assert_eq!(completion.call_count(), 0);

    // 2. First translation calls AI once, saves to store, strips own pixel
    let first = service
        .process_message(&owner, None, msg_id, "zh-CN", TranslationAction::Translate)
        .await
        .expect("first translation should succeed");
    assert_eq!(first.status, "translated");
    assert!(first.saved);
    assert!(!first.from_cache);
    assert_eq!(completion.call_count(), 1);
    assert!(first.translated_html.as_deref().unwrap().contains("$50,000"));
    assert!(!first.translated_html.as_deref().unwrap().contains("/t/o/"));

    // 3. Second translation or Get reads persisted result with 0 additional AI calls,
    // even when AI admission is disabled/unavailable!
    admission.set_allow(false);
    let second = service
        .process_message(&owner, None, msg_id, "zh-CN", TranslationAction::Translate)
        .await
        .expect("cached translation should succeed even when AI admission is down");
    assert_eq!(second.status, "translated");
    assert!(second.saved);
    assert!(second.from_cache);
    assert_eq!(second.translated_html, first.translated_html);
    assert_eq!(completion.call_count(), 1);

    let prefetched = service
        .process_message(&owner, None, msg_id, "zh-CN", TranslationAction::Get)
        .await
        .expect("prefetch should work when AI admission is down");
    assert_eq!(prefetched.status, "translated");
    assert!(prefetched.saved);
    assert_eq!(completion.call_count(), 1);

    // 4. Different target language (`ja`) is stored separately
    admission.set_allow(true);
    let ja = service
        .process_message(&owner, None, msg_id, "ja", TranslationAction::Translate)
        .await
        .expect("ja translation should succeed");
    assert_eq!(ja.status, "translated");
    assert!(ja.translated_html.as_deref().unwrap().contains("[ja]"));
    assert_eq!(completion.call_count(), 2);

    // 5. Unauthorized user cannot read or generate translations for this message
    let unauthorized_get = service
        .process_message(&other_user, None, msg_id, "zh-CN", TranslationAction::Get)
        .await;
    assert!(matches!(
        unauthorized_get,
        Err(TranslationServiceError::Store(TranslationStoreError::Forbidden))
    ));
    let unauthorized_translate = service
        .process_message(
            &other_user,
            None,
            msg_id,
            "zh-CN",
            TranslationAction::Translate,
        )
        .await;
    assert!(matches!(
        unauthorized_translate,
        Err(TranslationServiceError::Store(TranslationStoreError::Forbidden))
    ));
    assert_eq!(completion.call_count(), 2);
}

#[tokio::test]
async fn service_handles_partial_retry_without_overwriting_succeeded_segments_and_dedupes_concurrency() {
    let store = InMemoryTranslationStore::new();
    let completion = Arc::new(MockCompletion {
        calls: AtomicUsize::new(0),
        fail_all: false,
        omit_segment_ids: Mutex::new(vec!["h_1".to_owned()]),
        last_requested_ids: Mutex::new(Vec::new()),
        delay_ms: 30,
    });
    let admission = MockAdmission::allowing();
    let service = EmailTranslationService::new(store.clone(), completion.clone(), admission);

    let owner = MacroUserIdStr::parse_from_str("macro|owner@example.com").unwrap();
    let msg_id = Uuid::new_v4();
    let thread_id = Uuid::new_v4();
    let link_id = Uuid::new_v4();

    store.put_message(
        owner.as_ref(),
        AuthoritativeEmailMessage {
            message_id: msg_id,
            thread_id,
            link_id,
            is_sent: false,
            is_draft: false,
            subject: Some("Hello".to_owned()),
            snippet: None,
            body_html_sanitized: Some("<p>First paragraph</p><p>Second paragraph</p>".to_owned()),
            body_replyless: Some("<p>First paragraph</p><p>Second paragraph</p>".to_owned()),
            body_text: None,
            body_macro: None,
        },
    );

    // 1. First translate omits segment `h_1` -> status is `partial`
    let partial = service
        .process_message(&owner, None, msg_id, "zh-CN", TranslationAction::Translate)
        .await
        .expect("partial translation should persist");
    assert_eq!(partial.status, "partial");
    assert!(partial.saved);
    assert!(
        partial
            .translated_html
            .as_deref()
            .unwrap()
            .contains("[zh-CN] First paragraph")
    );
    assert!(
        partial
            .translated_html
            .as_deref()
            .unwrap()
            .contains("<p>Second paragraph</p>")
    );

    // 2. Retry only sends the missing segment `h_1` and preserves `subj` and `h_0`
    completion.omit_segment_ids.lock().unwrap().clear();
    let retried = service
        .process_message(&owner, None, msg_id, "zh-CN", TranslationAction::Retry)
        .await
        .expect("retry should complete missing segment");
    assert_eq!(retried.status, "translated");
    assert!(retried.saved);
    assert!(
        retried
            .translated_html
            .as_deref()
            .unwrap()
            .contains("[zh-CN] First paragraph")
    );
    assert!(
        retried
            .translated_html
            .as_deref()
            .unwrap()
            .contains("[zh-CN] Second paragraph")
    );
    let last_reqs = completion.last_requested_ids.lock().unwrap();
    assert_eq!(last_reqs.last().unwrap(), &vec!["h_1".to_owned()]);
    drop(last_reqs);

    // 3. Concurrent requests for a new language (`fr`) coalesce into a single AI call
    let s1 = service.clone();
    let s2 = service.clone();
    let u1 = owner.clone();
    let u2 = owner.clone();
    let calls_before = completion.call_count();
    let (r1, r2) = tokio::join!(
        s1.process_message(&u1, None, msg_id, "fr", TranslationAction::Translate),
        s2.process_message(&u2, None, msg_id, "fr", TranslationAction::Translate),
    );
    assert_eq!(r1.unwrap().status, "translated");
    assert_eq!(r2.unwrap().status, "translated");
    assert_eq!(completion.call_count(), calls_before + 1);

    // 4. Save failure never marks as saved
    *store.fail_upsert.lock().unwrap() = true;
    let save_err = service
        .process_message(&owner, None, msg_id, "de", TranslationAction::Translate)
        .await;
    assert!(save_err.is_err());
}

#[tokio::test]
async fn thread_summary_detects_new_reply_and_snippet_changes() {
    let store = InMemoryTranslationStore::new();
    let completion = MockCompletion::new();
    let admission = MockAdmission::allowing();
    let service = EmailTranslationService::new(store.clone(), completion.clone(), admission);

    let owner = MacroUserIdStr::parse_from_str("macro|owner@example.com").unwrap();
    let thread_id = Uuid::new_v4();
    let link_id = Uuid::new_v4();
    let msg_1 = Uuid::new_v4();
    let msg_2 = Uuid::new_v4();

    store.put_thread(
        owner.as_ref(),
        AuthoritativeEmailThreadSummary {
            thread_id,
            link_id,
            latest_message_id: Some(msg_1),
            subject: "Project Launch".to_owned(),
            snippet: "Initial proposal attached".to_owned(),
        },
    );

    let t1 = service
        .process_thread(
            &owner,
            None,
            thread_id,
            ThreadContentType::ThreadSummary,
            "zh-CN",
            TranslationAction::Translate,
        )
        .await
        .expect("thread summary translation should succeed");
    assert_eq!(t1.status, "translated");
    assert_eq!(completion.call_count(), 1);

    // Simulate a new reply arriving in the same thread with updated snippet
    store.put_thread(
        owner.as_ref(),
        AuthoritativeEmailThreadSummary {
            thread_id,
            link_id,
            latest_message_id: Some(msg_2),
            subject: "Project Launch".to_owned(),
            snippet: "Approved by finance team".to_owned(),
        },
    );

    let t2 = service
        .process_thread(
            &owner,
            None,
            thread_id,
            ThreadContentType::ThreadSummary,
            "zh-CN",
            TranslationAction::Translate,
        )
        .await
        .expect("updated thread summary should re-translate");
    assert_ne!(t1.source_hash, t2.source_hash);
    assert!(
        t2.translated_snippet
            .as_deref()
            .unwrap()
            .contains("Approved by finance team")
    );
    assert_eq!(completion.call_count(), 2);
}

#[sqlx::test(migrator = "MACRO_DB_MIGRATIONS")]
async fn pg_store_persists_and_reads_across_fresh_instances(
    pool: Pool<Postgres>,
) -> anyhow::Result<()> {
    let link_id = Uuid::from_u128(0x20000000_0000_0000_0000_000000000001);
    let thread_id = Uuid::from_u128(0x20000000_0000_0000_0000_000000000002);
    let message_id = Uuid::from_u128(0x20000000_0000_0000_0000_000000000003);
    let owner_macro_id = "macro|translator@test.local";
    let intruder_macro_id = "macro|intruder@test.local";

    sqlx::query(
        r#"
        INSERT INTO email_links (id, macro_id, fusionauth_user_id, email_address, provider)
        VALUES ($1, $2, 'fusion-translator', 'translator@test.local', 'GMAIL')
        "#,
    )
    .bind(link_id)
    .bind(owner_macro_id)
    .execute(&pool)
    .await?;

    sqlx::query("INSERT INTO email_threads (id, link_id) VALUES ($1, $2)")
        .bind(thread_id)
        .bind(link_id)
        .execute(&pool)
        .await?;

    sqlx::query(
        r#"
        INSERT INTO email_messages (
            id, thread_id, link_id, subject, snippet, body_html_sanitized, body_text, is_sent, is_draft
        )
        VALUES ($1, $2, $3, 'Invoice #INV-900', 'Total $200.00', '<p>Please pay $200.00 for #INV-900</p>', 'Please pay $200.00 for #INV-900', FALSE, FALSE)
        "#,
    )
    .bind(message_id)
    .bind(thread_id)
    .bind(link_id)
    .execute(&pool)
    .await?;

    let completion = MockCompletion::new();
    let admission = MockAdmission::allowing();

    // Instance 1 writes translation to PostgreSQL
    let store_1 = Arc::new(PgEmailTranslationStore::new_pool_only(pool.clone()));
    let service_1 = EmailTranslationService::new(store_1, completion.clone(), admission.clone());
    let owner_user = MacroUserIdStr::parse_from_str(owner_macro_id).unwrap();
    let intruder_user = MacroUserIdStr::parse_from_str(intruder_macro_id).unwrap();

    let written = service_1
        .process_message(
            &owner_user,
            None,
            message_id,
            "zh-CN",
            TranslationAction::Translate,
        )
        .await?;
    assert_eq!(written.status, "translated");
    assert!(written.saved);
    assert_eq!(completion.call_count(), 1);

    // Instance 2 (fresh service & store instance) reads persisted translation with 0 AI calls
    let store_2 = Arc::new(PgEmailTranslationStore::new_pool_only(pool.clone()));
    let service_2 = EmailTranslationService::new(store_2, completion.clone(), admission);
    let read_back = service_2
        .process_message(&owner_user, None, message_id, "zh-CN", TranslationAction::Get)
        .await?;
    assert_eq!(read_back.status, "translated");
    assert!(read_back.saved);
    assert!(read_back.from_cache);
    assert_eq!(read_back.translated_html, written.translated_html);
    assert_eq!(completion.call_count(), 1);

    // Intruder cannot read or translate
    let denied = service_2
        .process_message(&intruder_user, None, message_id, "zh-CN", TranslationAction::Get)
        .await;
    assert!(matches!(
        denied,
        Err(TranslationServiceError::Store(TranslationStoreError::Forbidden))
    ));

    Ok(())
}

#[test]
fn model_selection_prioritizes_email_translation_model_and_validates_or_falls_back() {
    use super::service::{ModelConfigOrigin, resolve_translation_model_from};

    // 1. Explicit valid EMAIL_TRANSLATION_MODEL takes highest priority
    let resolved = resolve_translation_model_from(|key| match key {
        "EMAIL_TRANSLATION_MODEL" => Some("openai/gpt-5.6".to_owned()),
        "DEFAULT_AI_MODEL" => Some("anthropic/claude-opus-4-8".to_owned()),
        _ => None,
    })
    .expect("should resolve explicit model");
    assert_eq!(resolved.model_id, "openai/gpt-5.6");
    assert_eq!(resolved.origin, ModelConfigOrigin::EmailTranslationModel);

    let resolved = resolve_translation_model_from(|key| match key {
        "EMAIL_TRANSLATION_MODEL" => Some("anthropic/claude-haiku-4-5".to_owned()),
        _ => None,
    })
    .expect("should resolve explicit anthropic model");
    assert_eq!(resolved.model_id, "anthropic/claude-haiku-4-5");
    assert_eq!(resolved.origin, ModelConfigOrigin::EmailTranslationModel);

    // 2. Explicit invalid EMAIL_TRANSLATION_MODEL must return an error and NOT fallback
    let err = resolve_translation_model_from(|key| match key {
        "EMAIL_TRANSLATION_MODEL" => Some("invalid-model-without-slash".to_owned()),
        "DEFAULT_AI_MODEL" => Some("openai/gpt-5.6".to_owned()),
        _ => None,
    })
    .unwrap_err();
    assert!(matches!(err, TranslationServiceError::InvalidInput(_)));

    let err = resolve_translation_model_from(|key| match key {
        "EMAIL_TRANSLATION_MODEL" => Some("unsupported_unknown_provider/model-x".to_owned()),
        _ => None,
    })
    .unwrap_err();
    assert!(matches!(err, TranslationServiceError::InvalidInput(_)));

    // 3. When EMAIL_TRANSLATION_MODEL is not set, fallback to DEFAULT_AI_MODEL
    let resolved = resolve_translation_model_from(|key| match key {
        "DEFAULT_AI_MODEL" => Some("openai/gpt-5.6".to_owned()),
        _ => None,
    })
    .expect("should resolve default model");
    assert_eq!(resolved.model_id, "openai/gpt-5.6");
    assert_eq!(resolved.origin, ModelConfigOrigin::DefaultAiModel);

    // 4. When all model env vars are absent, fallback to project standard default
    let resolved = resolve_translation_model_from(|_| None).expect("should resolve project default");
    assert_eq!(resolved.model_id, agent::PredefinedModel::Fast.to_string());
    assert_eq!(resolved.origin, ModelConfigOrigin::ProjectFallback);
}
