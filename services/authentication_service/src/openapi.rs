#![allow(unused)]

mod api;
mod config;
// PRIVATE-HOOK: self_host_health:openapi_features
#[path = "../../../packages/fork/self-host-health/backend/mod.rs"]
mod features;
mod generate_password;
mod microsoft_token_cipher;
mod rate_limit_config;
mod service;

use utoipa::OpenApi;

fn main() {
    println!(
        "{}",
        api::swagger::ApiDoc::openapi().to_pretty_json().unwrap()
    );
}
