//! Private feature: Read receipts and open-tracking pixels.

pub mod routes;
pub mod settings;
pub mod status;
pub mod tracking;

pub use routes::{messages_router, public_router, settings_router};
