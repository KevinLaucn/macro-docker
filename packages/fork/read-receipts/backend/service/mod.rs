//! Private feature: Read receipts and open-tracking pixels.

pub mod routes;
pub mod settings;
pub mod status;
pub mod tracking;

pub use routes::{messages_router, public_router, settings_router};

pub(crate) trait ApiContextExt {
    fn db(&self) -> &sqlx::PgPool;
}

impl ApiContextExt for crate::api::context::ApiContext {
    fn db(&self) -> &sqlx::PgPool {
        &self.attachment_reads.files.db
    }
}

