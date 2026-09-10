use axum::extract::FromRef;
#[cfg(feature = "calendar")]
use calendar_events::{
    domain::{mutations::CalendarMutationServiceImpl, service::CalendarService},
    outbound::{google::GoogleCalendarClient, pg::PgCalendarRepository},
};
use document_storage_service_client::DocumentStorageServiceClient;
use email::{
    domain::service::EmailServiceImpl,
    inbound::axum::{
        axum_impls::GmailTokenState, get_thread_router::EmailThreadRouterState,
        previews_router::EmailRouterState,
    },
    outbound::{EmailPgRepo, GmailTokenProviderImpl},
};
#[cfg(feature = "calendar")]
use email_service::calendar_refresh::ConnectionGatewayCalendarRefresh;
use email_service::calendar_tokens::CalendarTokenProviderAdapter;
#[cfg(feature = "calendar")]
use email_service::pubsub::calendar_backfill_adapters::RedisCalendarRequestGate;

use email_service::config::Config;
use email_service::outbound::email_api::GmailApi;
use email_service::util::redis::RedisClient;
use entity_access::{domain::service::EntityAccessServiceImpl, outbound::PgAccessRepository};
use entity_access_management::domain::service::EntityAccessManagementServiceImpl;
use frecency::{domain::services::FrecencyQueryServiceImpl, outbound::postgres::FrecencyPgStorage};
use macro_auth::InternalApiKey;
use macro_auth::middleware::decode_jwt::JwtValidationArgs;
use macro_authorization::{
    MacroAuthJwtValidator, MacroAuthorizationServiceImpl, MacroAuthorizationState,
};
#[cfg(not(feature = "event_broker"))]
use macro_event_broker::NoopMacroEventBroker;
#[cfg(feature = "event_broker")]
use macro_event_broker::{KafkaEventPublisher, MacroEventBrokerService};
use static_file_service_client::StaticFileServiceClient;
use std::sync::Arc;
use system_properties::{PgSystemPropertiesRepository, SystemPropertiesServiceImpl};
#[cfg(feature = "event_broker")]
use tokio_util::task::TaskTracker;

pub(crate) type AuthorizationService = MacroAuthorizationServiceImpl<MacroAuthJwtValidator>;
#[cfg(feature = "calendar")]
pub(crate) type CalendarGrantService = CalendarService<PgCalendarRepository>;
#[cfg(feature = "calendar")]
pub(crate) type CalendarMutationSvc = CalendarMutationServiceImpl<
    PgCalendarRepository,
    GoogleCalendarClient<RedisCalendarRequestGate>,
    CalendarTokenProviderAdapter,
    EmailEventBroker,
    ConnectionGatewayCalendarRefresh,
>;
pub(crate) type EmailEntityAccessService = EntityAccessServiceImpl<PgAccessRepository>;
pub(crate) type EmailEntityAccessManagementService =
    EntityAccessManagementServiceImpl<entity_access_management::outbound::PgRepository>;
#[cfg(feature = "event_broker")]
pub(crate) type EmailEventBroker = MacroEventBrokerService<KafkaEventPublisher, TaskTracker>;
#[cfg(not(feature = "event_broker"))]
pub(crate) type EmailEventBroker = NoopMacroEventBroker;
pub(crate) type EmailSvc = EmailServiceImpl<
    EmailPgRepo,
    FrecencyQueryServiceImpl<FrecencyPgStorage>,
    sqs_client::SQS,
    crm::domain::service::CrmServiceImpl<
        crm::outbound::companies_repo::CompaniesRepositoryImpl,
        crm::outbound::no_op_resolver::NoOpCompanyMetadataResolver,
    >,
    EmailEntityAccessManagementService,
    EmailEventBroker,
>;

#[derive(Clone, FromRef)]
pub(crate) struct ApiContext {
    pub db: sqlx::Pool<sqlx::Postgres>,
    pub auth_service_client: Arc<authentication_service_client::AuthServiceClient>,
    // The raw client is retained only for Gmail webhook JWKS/JWT authentication.
    pub gmail_client: Arc<gmail_client::GmailClient>,
    pub email_api: GmailApi,
    pub redis_client: Arc<RedisClient>,
    pub sqs_client: Arc<sqs_client::SQS>,
    pub s3_client: Arc<s3_client::S3>,
    pub sfs_client: Arc<StaticFileServiceClient>,
    pub dss_client: Arc<DocumentStorageServiceClient>,
    pub system_properties_service: Arc<SystemPropertiesServiceImpl<PgSystemPropertiesRepository>>,
    pub authorization_state: MacroAuthorizationState<AuthorizationService>,
    pub jwt_args: JwtValidationArgs,
    pub config: Arc<Config>,
    pub internal_api_key: InternalApiKey,
    pub email_service: EmailRouterState<EmailSvc>,
    pub entity_access_service: Arc<EmailEntityAccessService>,
    pub email_thread_state:
        EmailThreadRouterState<EmailSvc, EmailEntityAccessService, AuthorizationService>,
    pub gmail_token_state: GmailTokenState<GmailTokenProviderImpl>,
    pub macro_event_broker: Arc<EmailEventBroker>,
    #[cfg(feature = "calendar")]
    pub calendar_service: Arc<CalendarGrantService>,
    #[cfg(feature = "calendar")]
    pub calendar_mutation_service: Arc<CalendarMutationSvc>,
}
