#[cfg(not(feature = "full-saas"))]
use axum::{Json, http::StatusCode};
use axum::{
    Router,
    routing::{delete, get, patch, post, put},
};
#[cfg(not(feature = "full-saas"))]
use serde_json::{Value, json};
use tower_cookies::CookieManagerLayer;

use crate::api::ApiContext;
#[cfg(feature = "full-saas")]
use crate::api::context::EntityAccessServiceType;

// needs to be public in api crate for swagger
pub(in crate::api) mod create_user;
pub(in crate::api) mod delete_user;
#[cfg(feature = "full-saas")]
pub(in crate::api) mod get_legacy_user_permissions;
pub(in crate::api) mod get_name;
pub(in crate::api) mod get_user_info;
pub(in crate::api) mod get_user_link_exists;
#[cfg(feature = "full-saas")]
pub(in crate::api) mod get_user_organization;
#[cfg(feature = "full-saas")]
pub(in crate::api) mod get_user_quota;
pub(in crate::api) mod patch_ai_consent;
pub(in crate::api) mod patch_tutorial;
#[cfg(feature = "full-saas")]
pub(in crate::api) mod patch_user_group;
#[cfg(feature = "full-saas")]
pub(in crate::api) mod patch_user_onboarding;
pub(in crate::api) mod post_get_names;
pub(in crate::api) mod post_get_names_with_email;
pub(in crate::api) mod post_profile_pictures;
pub(in crate::api) mod put_name;
pub(in crate::api) mod put_profile_picture;
#[cfg(feature = "full-saas")]
pub(in crate::api) mod stripe;

pub fn router() -> Router<ApiContext> {
    Router::new()
        .route("/", post(create_user::handler))
        .merge(router_with_auth())
}

fn router_with_auth() -> Router<ApiContext> {
    let router = Router::new()
        .route("/me", get(get_user_info::handler))
        .route("/me", delete(delete_user::handler))
        .route("/profile_pictures", post(post_profile_pictures::handler))
        .route("/profile_picture", put(put_profile_picture::handler))
        .route("/name", put(put_name::handler))
        .route("/name", get(get_name::handler))
        .route("/get_names", post(post_get_names::handler_external))
        .route(
            "/get_names_with_email",
            post(post_get_names_with_email::handler),
        )
        .route("/link_exists", get(get_user_link_exists::handler))
        .route("/tutorial", patch(patch_tutorial::handler))
        .route("/ai_consent", patch(patch_ai_consent::handler));

    #[cfg(feature = "full-saas")]
    let router = router
        .route("/quota", get(get_user_quota::handler))
        .route(
            "/stripe/checkoutv2",
            post(
                stripe::create_checkout_session_v2::create_checkout_session::<
                    EntityAccessServiceType,
                >,
            ),
        )
        .route(
            "/stripe/portal",
            post(stripe::create_portal_session::create_portal_session),
        )
        .route(
            "/legacy_user_permissions",
            get(get_legacy_user_permissions::handler),
        )
        .route("/organization", get(get_user_organization::handler))
        .route("/group", patch(patch_user_group::handler))
        .route("/onboarding", patch(patch_user_onboarding::handler));

    #[cfg(not(feature = "full-saas"))]
    let router = router
        .route("/stripe/checkoutv2", post(payment_disabled))
        .route("/stripe/portal", post(payment_disabled));

    router.layer(CookieManagerLayer::new())
}

#[cfg(not(feature = "full-saas"))]
async fn payment_disabled() -> (StatusCode, Json<Value>) {
    (
        StatusCode::NOT_IMPLEMENTED,
        Json(json!({
            "error": "payment_disabled",
            "message": "Payment and subscription features are disabled for this deployment"
        })),
    )
}
