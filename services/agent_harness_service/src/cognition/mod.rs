//! Chat, completions, and integration APIs hosted by the agent harness.

mod api;
pub mod config;
mod core;
// PRIVATE-HOOK: email_translation:cognition-module
#[path = "../../../../packages/fork/email-translation/backend/mod.rs"]
pub mod email_translation;
mod model;
mod server;
mod service;

pub use api::swagger::ApiDoc;
pub use server::{CognitionRuntime, build};
/// Bounded tool-free completions, which routine suggestions use too.
pub use service::structured_completion::{
    ToolFreeCompletion, ToolFreeCompletionService, ToolFreeRequest,
};
