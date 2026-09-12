//! Read-receipt preferences storage.

use sqlx::PgPool;
use sqlx::types::Uuid;

/// Returns whether read receipts (open tracking on outgoing mail) are enabled
/// for a link. Links without a settings row use the feature default: enabled.
#[tracing::instrument(skip(pool), err)]
pub async fn fetch_read_receipts_enabled(pool: &PgPool, link_id: Uuid) -> anyhow::Result<bool> {
    let enabled = sqlx::query_scalar::<_, bool>(
        r#"
        SELECT read_receipts_enabled
        FROM email_settings
        WHERE link_id = $1
        "#,
    )
    .bind(link_id)
    .fetch_optional(pool)
    .await?;

    Ok(enabled.unwrap_or(true))
}

/// Updates only the read-receipt preference without touching signature
/// settings. Creates the settings row with the existing signature defaults when
/// necessary.
#[tracing::instrument(skip(pool), err)]
pub async fn set_read_receipts_enabled(
    pool: &PgPool,
    link_id: Uuid,
    enabled: bool,
) -> anyhow::Result<bool> {
    let value = sqlx::query_scalar::<_, bool>(
        r#"
        INSERT INTO email_settings (
            link_id,
            signature_on_replies_forwards,
            read_receipts_enabled
        )
        VALUES ($1, FALSE, $2)
        ON CONFLICT (link_id)
        DO UPDATE SET
            read_receipts_enabled = EXCLUDED.read_receipts_enabled,
            updated_at = NOW()
        RETURNING read_receipts_enabled
        "#,
    )
    .bind(link_id)
    .bind(enabled)
    .fetch_one(pool)
    .await?;

    Ok(value)
}

/// Global email extension settings for a user.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GlobalExtensionSettings {
    pub email_open_tracking_enabled: bool,
    pub email_tracking_pixel_blocking_enabled: bool,
}

impl Default for GlobalExtensionSettings {
    fn default() -> Self {
        Self {
            email_open_tracking_enabled: true,
            email_tracking_pixel_blocking_enabled: false,
        }
    }
}

/// Fetches global extension settings for a user. Defaults to (true, false) if no row exists.
#[tracing::instrument(skip(pool), err)]
pub async fn fetch_global_extension_settings(
    pool: &PgPool,
    user_id: &str,
) -> anyhow::Result<GlobalExtensionSettings> {
    let row = sqlx::query_as::<_, (bool, bool)>(
        r#"
        SELECT email_open_tracking_enabled, email_tracking_pixel_blocking_enabled
        FROM email_extension_settings
        WHERE user_id = $1
        "#,
    )
    .bind(user_id)
    .fetch_optional(pool)
    .await?;

    Ok(row.map_or_else(GlobalExtensionSettings::default, |r| {
        GlobalExtensionSettings {
            email_open_tracking_enabled: r.0,
            email_tracking_pixel_blocking_enabled: r.1,
        }
    }))
}

/// Updates global open tracking preference for a user.
#[tracing::instrument(skip(pool), err)]
pub async fn set_global_open_tracking_enabled(
    pool: &PgPool,
    user_id: &str,
    enabled: bool,
) -> anyhow::Result<GlobalExtensionSettings> {
    let row = sqlx::query_as::<_, (bool, bool)>(
        r#"
        INSERT INTO email_extension_settings (
            user_id,
            email_open_tracking_enabled,
            email_tracking_pixel_blocking_enabled
        )
        VALUES ($1, $2, FALSE)
        ON CONFLICT (user_id)
        DO UPDATE SET
            email_open_tracking_enabled = EXCLUDED.email_open_tracking_enabled,
            updated_at = NOW()
        RETURNING email_open_tracking_enabled, email_tracking_pixel_blocking_enabled
        "#,
    )
    .bind(user_id)
    .bind(enabled)
    .fetch_one(pool)
    .await?;

    Ok(GlobalExtensionSettings {
        email_open_tracking_enabled: row.0,
        email_tracking_pixel_blocking_enabled: row.1,
    })
}

/// Updates global tracking pixel blocking preference for a user.
#[tracing::instrument(skip(pool), err)]
pub async fn set_global_pixel_blocking_enabled(
    pool: &PgPool,
    user_id: &str,
    enabled: bool,
) -> anyhow::Result<GlobalExtensionSettings> {
    let row = sqlx::query_as::<_, (bool, bool)>(
        r#"
        INSERT INTO email_extension_settings (
            user_id,
            email_open_tracking_enabled,
            email_tracking_pixel_blocking_enabled
        )
        VALUES ($1, TRUE, $2)
        ON CONFLICT (user_id)
        DO UPDATE SET
            email_tracking_pixel_blocking_enabled = EXCLUDED.email_tracking_pixel_blocking_enabled,
            updated_at = NOW()
        RETURNING email_open_tracking_enabled, email_tracking_pixel_blocking_enabled
        "#,
    )
    .bind(user_id)
    .bind(enabled)
    .fetch_one(pool)
    .await?;

    Ok(GlobalExtensionSettings {
        email_open_tracking_enabled: row.0,
        email_tracking_pixel_blocking_enabled: row.1,
    })
}
