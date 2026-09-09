use super::*;

use macro_db_migrator::MACRO_DB_MIGRATIONS;
use sqlx::{Pool, Postgres};

#[sqlx::test(migrator = "MACRO_DB_MIGRATIONS")]
async fn first_open_records_one_activity_event(pool: Pool<Postgres>) -> anyhow::Result<()> {
    let link_id = Uuid::from_u128(0x10000000_0000_0000_0000_000000000001);
    let thread_id = Uuid::from_u128(0x10000000_0000_0000_0000_000000000002);
    let message_id = Uuid::from_u128(0x10000000_0000_0000_0000_000000000003);
    let token = Uuid::from_u128(0x10000000_0000_0000_0000_000000000004);
    let macro_id = "macro|read-receipts@test.local";

    sqlx::query(
        r#"
        INSERT INTO email_links (id, macro_id, fusionauth_user_id, email_address, provider)
        VALUES ($1, $2, 'fusion-read-receipts', 'read-receipts@test.local', 'GMAIL')
        "#,
    )
    .bind(link_id)
    .bind(macro_id)
    .execute(&pool)
    .await?;

    sqlx::query(
        r#"
        INSERT INTO email_threads (id, link_id)
        VALUES ($1, $2)
        "#,
    )
    .bind(thread_id)
    .bind(link_id)
    .execute(&pool)
    .await?;

    sqlx::query(
        r#"
        INSERT INTO email_messages (
            id,
            thread_id,
            link_id,
            subject,
            is_sent,
            open_tracking_token
        )
        VALUES ($1, $2, $3, 'Read receipt test', TRUE, $4)
        "#,
    )
    .bind(message_id)
    .bind(thread_id)
    .bind(link_id)
    .bind(token)
    .execute(&pool)
    .await?;

    let first_open = record_message_open(&pool, token)
        .await?
        .expect("sent message should match tracking token");
    assert!(first_open.is_first_open);
    assert_eq!(first_open.open_count, 1);

    record_email_opened_activity(&pool, &first_open).await?;
    record_email_opened_activity(&pool, &first_open).await?;

    let activity_count: i64 = sqlx::query_scalar(
        r#"
        SELECT COUNT(*)
        FROM activity_events
        WHERE action = 'opened'
          AND subject_id = $1
          AND entity_type = 'thread'
          AND entity_id = $2
          AND action_payload->>'message_id' = $3
        "#,
    )
    .bind(macro_id)
    .bind(thread_id.to_string())
    .bind(message_id.to_string())
    .fetch_one(&pool)
    .await?;

    assert_eq!(activity_count, 1);

    let second_open = record_message_open(&pool, token)
        .await?
        .expect("sent message should still match tracking token");
    assert!(!second_open.is_first_open);
    assert_eq!(second_open.open_count, 2);

    Ok(())
}
