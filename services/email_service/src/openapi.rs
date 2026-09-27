#![allow(unused)]

mod api;
mod backfill_completion_service;
mod backfill_init_service;
mod backfill_outbox;
mod config;
// PRIVATE-HOOK: read_receipts:features
mod features;
mod outbound;
mod pubsub;
mod util;
mod utils;

use utoipa::OpenApi;

fn main() {
    println!(
        "{}",
        api::swagger::ApiDoc::openapi().to_pretty_json().unwrap()
    );
}
