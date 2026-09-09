//! Read-receipt (open) tracking for sent messages.
//!
//! At send time a unique token is stored on the outgoing message and embedded
//! in a tracking pixel URL inside the message HTML. Opens are recorded by the
//! email service's public pixel endpoint, keyed by that token.

use sqlx::PgPool;
use sqlx::types::Uuid;

#[cfg(test)]
mod test;

/// Assigns the open-tracking token embedded in an outgoing message's tracking
/// pixel. Errors if the message doesn't exist for `(message_id, link_id)`, so
/// callers never inject a pixel whose token wasn't persisted.
#[tracing::instrument(skip(pool), err)]
pub async fn set_message_open_tracking_token(
    pool: &PgPool,
    message_id: Uuid,
    link_id: Uuid,
    token: Uuid,
) -> anyhow::Result<()> {
    let result = sqlx::query(
        r#"
        UPDATE email_messages
        SET open_tracking_token = $3
        WHERE id = $1 AND link_id = $2
        "#,
    )
    .bind(message_id)
    .bind(link_id)
    .bind(token)
    .execute(pool)
    .await?;

    if result.rows_affected() != 1 {
        anyhow::bail!(
            "expected to set open tracking token on exactly one message, but {} rows matched (message_id={}, link_id={})",
            result.rows_affected(),
            message_id,
            link_id
        );
    }

    Ok(())
}

/// Records an open for a sent message identified by `token`. Returns the
/// message/link/thread IDs, updated open count, and whether this was the first open.
#[derive(Debug, Clone)]
pub struct RecordedOpen {
    pub message_id: Uuid,
    pub link_id: Uuid,
    pub thread_db_id: Uuid,
    pub open_count: i32,
    pub is_first_open: bool,
}

#[tracing::instrument(skip(pool, token), err)]
pub async fn record_message_open(
    pool: &PgPool,
    token: Uuid,
) -> anyhow::Result<Option<RecordedOpen>> {
    let row = sqlx::query_as::<_, (Uuid, Uuid, Uuid, i32, bool)>(
        r#"
        UPDATE email_messages
        SET first_opened_at = COALESCE(email_messages.first_opened_at, NOW()),
            last_opened_at = NOW(),
            open_count = email_messages.open_count + 1
        FROM (
            SELECT id, first_opened_at
            FROM email_messages
            WHERE open_tracking_token = $1 AND is_sent = true
            FOR UPDATE
        ) old
        WHERE email_messages.id = old.id
        RETURNING email_messages.id, email_messages.link_id, email_messages.thread_id,
                  email_messages.open_count, (old.first_opened_at IS NULL) as is_first_open
        "#,
    )
    .bind(token)
    .fetch_optional(pool)
    .await?;

    Ok(row.map(
        |(message_id, link_id, thread_db_id, open_count, is_first_open)| RecordedOpen {
            message_id,
            link_id,
            thread_db_id,
            open_count,
            is_first_open,
        },
    ))
}

/// Derives a deterministic activity event id for an email open.
pub fn email_opened_activity_id(message_id: Uuid) -> Uuid {
    static ACTIVITY_ID_NAMESPACE: std::sync::LazyLock<Uuid> =
        std::sync::LazyLock::new(|| Uuid::new_v5(&Uuid::NAMESPACE_OID, b"macro.activity_events"));
    Uuid::new_v5(
        &ACTIVITY_ID_NAMESPACE,
        format!("email_opened:{message_id}").as_bytes(),
    )
}

/// Records a first-open activity event in `activity_events` table for an email thread.
/// Subject entity is the email thread; actor is the autonomous system bot (`bot|00000000-0000-0000-0000-000000005759`).
/// The recipient's true identity is unverified, so an anonymous/system actor is attributed.
#[tracing::instrument(skip(pool), err)]
pub async fn record_email_opened_activity(
    pool: &PgPool,
    open: &RecordedOpen,
) -> anyhow::Result<()> {
    // Resolve macro_id (owner of this inbox link) to populate subject_id
    let macro_id: Option<String> = sqlx::query_scalar(
        r#"
        SELECT l.macro_id
        FROM email_links l
        WHERE l.id = $1
        "#,
    )
    .bind(open.link_id)
    .fetch_optional(pool)
    .await?;

    let Some(macro_id) = macro_id else {
        tracing::warn!(link_id = %open.link_id, "Could not find macro_id for link to record open activity");
        return Ok(());
    };

    let activity_id = email_opened_activity_id(open.message_id);
    let actor_id = "bot|00000000-0000-0000-0000-000000005759"; // MACRO_SYSTEM_BOT_ID
    let subject_id = macro_id;
    let action = "opened";
    let entity_type = "thread";
    let entity_id = open.thread_db_id.to_string();
    let payload = serde_json::json!({
        "message_id": open.message_id.to_string(),
        "source": "tracking_pixel"
    });

    sqlx::query(
        r#"
        INSERT INTO activity_events
            (id, actor_id, subject_id, action, action_payload, entity_type, entity_id, occurred_at)
        VALUES
            ($1, $2, $3, $4, $5, $6, $7, NOW())
        ON CONFLICT (id) DO NOTHING
        "#,
    )
    .bind(activity_id)
    .bind(actor_id)
    .bind(subject_id)
    .bind(action)
    .bind(Some(payload))
    .bind(entity_type)
    .bind(entity_id)
    .execute(pool)
    .await?;

    Ok(())
}
