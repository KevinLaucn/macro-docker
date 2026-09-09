use crate::api::context::ApiContext;
use crate::api::email::settings::patch::patch_settings_handler;
use axum::Router;
use axum::routing::patch;

pub(crate) mod patch;
pub(crate) mod read_receipts;

pub fn router(state: ApiContext) -> Router<ApiContext> {
    Router::new()
        .route("/", patch(patch_settings_handler))
        // PRIVATE-HOOK: read_receipts:settings_router
        .merge(crate::features::read_receipts::settings_router())
        .layer(axum::middleware::from_fn_with_state(
            state.clone(),
            crate::api::middleware::link::attach_link_context,
        ))
}
