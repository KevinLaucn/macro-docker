use crate::api::context::ApiContext;
use anyhow::Context;
use axum::Router;
use axum::http::HeaderName;
use macro_auth::constant::MACRO_REFRESH_TOKEN_HEADER;
use macro_tower_layers::MacroRequestIdAndTracingLayer;
use std::net::SocketAddr;
use std::time::Duration;
use tower_http::compression::CompressionLayer;
#[cfg(feature = "full-saas")]
use utoipa::OpenApi;
#[cfg(feature = "full-saas")]
use utoipa_swagger_ui::SwaggerUi;

// Utilities
pub(crate) mod context;

// Routes
#[cfg(feature = "full-saas")]
mod cursor_api_key;
#[cfg(feature = "full-saas")]
#[allow(unused_imports)]
mod email;
mod link;
#[cfg(feature = "full-saas")]
#[allow(unused_imports)]
mod merge;
#[cfg(feature = "full-saas")]
mod mobile_welcome_email;

#[cfg(feature = "full-saas")]
mod github_pull_requests;
mod health;
mod internal;
mod jwt;
mod jwt_session;
mod login;
mod logout;
mod oauth;
mod oauth2;
mod permissions;
pub(crate) mod permissions_extractor;
mod session;
pub(crate) mod signup_policy;
mod user;
mod webhooks;

// Misc
mod middleware;
#[cfg(feature = "full-saas")]
pub(crate) mod swagger;
mod utils;

#[cfg(test)]
mod test;

/// Path prefix the shared gateway ALB forwards unmodified. Dual-mounted
/// alongside `/` so the dedicated ALB keeps working during cutover.
const GATEWAY_PATH_PREFIX: &str = "/auth";

pub async fn setup_and_serve(state: ApiContext, port: usize) -> anyhow::Result<()> {
    let cors = macro_cors::cors_layer_with_headers(vec![HeaderName::from_static(
        MACRO_REFRESH_TOKEN_HEADER,
    )]);

    let env = state.environment;

    let app = api_router(state.clone())
        .with_state(state)
        .layer(MacroRequestIdAndTracingLayer::new(Duration::from_millis(200)).into_inner())
        // The health router is attached here so we don't attach the logging middleware to it
        .merge(health::router())
        .layer(cors)
        .layer(CompressionLayer::new());
    let app = mount_at_root_and_prefix(app);
    #[cfg(feature = "full-saas")]
    let app = app.merge(swagger_ui());

    let listener = tokio::net::TcpListener::bind(format!("0.0.0.0:{}", port))
        .await
        .unwrap();
    tracing::info!(
        "authentication service is up and running with environment {:?} on port {}",
        &env,
        &port
    );
    axum::serve(
        listener,
        app.into_make_service_with_connect_info::<SocketAddr>(),
    )
    .with_graceful_shutdown(macro_entrypoint::shutdown_signal())
    .await
    .context("error starting service")
}

fn mount_at_root_and_prefix(inner: Router) -> Router {
    Router::new()
        .merge(inner.clone())
        .nest(GATEWAY_PATH_PREFIX, inner)
}

#[cfg(feature = "full-saas")]
fn swagger_ui() -> Router {
    Router::new()
        .merge(SwaggerUi::new("/docs").url("/api-doc/openapi.json", swagger::ApiDoc::openapi()))
        .merge(
            SwaggerUi::new("/auth/docs")
                .url("/auth/api-doc/openapi.json", swagger::ApiDoc::openapi()),
        )
}

fn api_router(state: ApiContext) -> Router<ApiContext> {
    let router = Router::new()
        .nest("/internal", internal::router())
        .nest("/permissions", permissions::router())
        .nest("/login", login::router(state.clone()))
        .nest("/logout", logout::router())
        .nest("/oauth", oauth::router(state.clone()))
        .nest("/oauth2", oauth2::router())
        .nest("/user", user::router())
        .nest("/link", link::router())
        .nest("/jwt", jwt::router())
        .nest("/session", session::router())
        .nest(
            "/webhooks",
            webhooks::router().layer(axum::middleware::from_fn(
                macro_middleware::connection_drop_prevention_handler,
            )),
        )
        // PRIVATE-HOOK: self_host_health:admin_route
        .nest(
            "/admin",
            crate::features::self_host_health::router(state.clone()),
        );

    #[cfg(feature = "full-saas")]
    let router = router
        .merge(native_app_service::inbound::native_app_router(
            native_app_service::inbound::RouterState {
                inner: state.native_app_service.clone(),
            },
        ))
        .nest("/cursor-api-key", cursor_api_key::router())
        .nest("/github_pull_requests", github_pull_requests::router())
        .nest(
            "/team",
            teams::inbound::axum_router::teams_router(
                teams::inbound::axum_router::TeamRouterState {
                    service: state.teams_service.clone(),
                    entity_access_service: state.entity_access_service.clone(),
                    authorization_state: state.authorization_state.clone(),
                },
            ),
        )
        .nest(
            "/referral",
            referral::inbound::axum_router::referral_router(
                referral::inbound::axum_router::ReferralRouterState {
                    service: state.referral_service.clone(),
                    rate_limiter: state.rate_limit_service.clone(),
                    authorization_state: state.authorization_state.clone(),
                },
            ),
        )
        .merge(mobile_welcome_email::router(state.clone()));

    router
}
