#!/usr/bin/env ruby
# frozen_string_literal: true

require "open3"

TARGET = ENV.fetch("TARGET")
CONFLICT_PATHS = %w[
  Cargo.toml
  apps/web/src/features/block-email/component/TopBar.tsx
  apps/web/src/features/block-unknown/component/Block.tsx
  apps/web/src/features/companies/Company/Company.tsx
  apps/web/src/features/contacts/Contact/ContactHeader.tsx
  apps/web/src/features/email-message/components/message-card.tsx
  apps/web/src/features/email-thread/views/message-list.tsx
  apps/web/src/features/email-view/components/EmailHeader.tsx
  apps/web/src/features/email-view/components/EmailList.tsx
  apps/web/src/features/email-view/components/EmailSidebar.tsx
  apps/web/src/features/email-view/email-view.tsx
  apps/web/src/features/entity/extractors/entity-icon.tsx
  apps/web/src/features/settings/ConnectedAccounts.tsx
  apps/web/src/lib/core/constant/featureFlags.ts
  apps/web/src/lib/core/constant/settingsTabsConfig.tsx
  apps/web/src/lib/queries/sync/SyncProvider.tsx
  services/authentication_service/Cargo.toml
  services/authentication_service/src/api.rs
  services/authentication_service/src/main.rs
  tooling/xtask/crates/xtask_local/src/local/build/zigbuild.rs
  tooling/xtask/crates/xtask_local/src/local/cli/test.rs
  tooling/xtask/crates/xtask_local/src/local/inventory.rs
  tooling/xtask/crates/xtask_local/src/local/local_env.rs
].freeze

def git!(*args)
  out, err, status = Open3.capture3("git", *args)
  abort "git #{args.join(' ')} failed:\n#{err}" unless status.success?
  out
end

def rewrite(path)
  content = File.read(path)
  updated = yield(content)
  abort "#{path}: resolver produced no content" if updated.nil? || updated.empty?
  File.write(path, updated)
end

def replace_once!(content, old, new_value, label)
  count = content.scan(Regexp.new(Regexp.escape(old))).length
  abort "#{label}: expected one anchor, found #{count}" unless count == 1
  content.sub(old, new_value)
end

def replace_regex_once!(content, pattern, new_value, label)
  count = content.scan(pattern).length
  abort "#{label}: expected one regex anchor, found #{count}" unless count == 1
  content.sub(pattern, new_value)
end

def insert_after!(content, anchor, addition, label)
  replace_once!(content, anchor, anchor + addition, label)
end

# Resolve all true Git conflicts from current upstream, then add only registered
# private integration points below.
git!("checkout", TARGET, "--", *CONFLICT_PATHS)

rewrite("Cargo.toml") do |c|
  insert_after!(
    c,
    "members = [\n",
    "  # PRIVATE-HOOK: search_upload_worker:workspace_member\n  \"packages/fork/search-upload-worker\",\n",
    "workspace search upload hook"
  )
end

rewrite("apps/web/src/features/block-email/component/TopBar.tsx") do |c|
  c = insert_after!(c, "import { buildEntityData } from '@entity';\n", "import { t } from '@macro/i18n';\n", "TopBar i18n import")
  {
    "label: 'Mark done'," => "label: () => t('Mark done'),",
    "label: 'Mark as not done'," => "label: () => t('Mark as not done'),",
    "label: 'Mark unread'," => "label: () => t('Mark unread'),",
    "label: 'Mark read'," => "label: () => t('Mark read'),",
    "label: 'Ask Macro'," => "label: () => t('Ask Macro'),",
    "label: 'Create task'," => "label: () => t('Create task'),",
    "label: 'Move to folder'," => "label: () => t('Move to folder'),",
    "label: 'Delete'," => "label: () => t('Delete'),",
    "label: 'Sender → Noise'," => "label: () => t('Sender → Noise'),",
    "label: 'Block Sender'," => "label: () => t('Block Sender'),",
  }.each { |old, new_value| c = replace_once!(c, old, new_value, "TopBar #{old}") }
  c
end

rewrite("apps/web/src/features/block-unknown/component/Block.tsx") do |c|
  c = insert_after!(
    c,
    "import { downloadFile } from '@filesystem/download';\n",
    "// PRIVATE-HOOK: adobe_preview:fallback_preview\nimport { AdobePreviewContainer, getAdobeFormatFromFileName } from '@macro/adobe-preview';\n",
    "Adobe preview import"
  )
  pattern = /<UnknownContent\n\s+fileName=\{fileName\(\)\}\n\s+onShare=\{shareCtx\.open\}\n\s+onDownload=\{\(\) => void downloadDocument\(\)\}\n\s+\/>/m
  new_value = <<~'TSX'.strip
    <Show
                when={getAdobeFormatFromFileName(fileName())}
                fallback={
                  <UnknownContent
                    fileName={fileName()}
                    onShare={shareCtx.open}
                    onDownload={() => void downloadDocument()}
                  />
                }
              >
                {(format) => (
                  <AdobePreviewContainer
                    format={format()}
                    fileName={fileName()}
                    getBlob={getBlob}
                  />
                )}
              </Show>
  TSX
  replace_regex_once!(c, pattern, new_value, "Adobe preview fallback")
end

rewrite("apps/web/src/features/companies/Company/Company.tsx") do |c|
  c = insert_after!(c, "import { SidePanel } from '@components/app/side-panel';\n", "import { t } from '@macro/i18n';\n", "Company i18n import")
  {
    'title="Details"' => "title={t('Details')}",
    'title="Properties"' => "title={t('Properties')}",
    'title="Contacts"' => "title={t('Contacts')}",
    'label="Add contact"' => "label={t('Add contact')}",
    'tooltip="Add contact"' => "tooltip={t('Add contact')}",
    'title="Sharing"' => "title={t('Sharing')}",
  }.each { |old, new_value| c = replace_once!(c, old, new_value, "Company #{old}") }
  c
end

rewrite("apps/web/src/features/contacts/Contact/ContactHeader.tsx") do |c|
  c = insert_after!(c, "import { getInitialsFromName } from '@core/user';\n", "import { t } from '@macro/i18n';\n", "ContactHeader i18n import")
  c = replace_once!(c, 'placeholder="Contact"', "placeholder={t('Contact')}", "Contact placeholder")
  c = replace_once!(c, 'ariaLabel="Contact name"', "ariaLabel={t('Contact name')}", "Contact aria")
  c = replace_once!(c, "fallback={'Loading contact…'}", "fallback={t('Loading contact…')}", "Contact loading")
  c
end

# This old component was orphaned: its props were never supplied by the current
# message view. Keep upstream message-card and remove the dead file.
git!("rm", "-f", "--ignore-unmatch", "apps/web/src/features/email-message/components/SentMessageIndicator.tsx")

rewrite("apps/web/src/features/email-thread/views/message-list.tsx") do |c|
  c = insert_after!(
    c,
    "import { StaticMarkdownContext } from '@core/component/LexicalMarkdown/component/core/StaticMarkdown';\n",
    "import {\n  EmailThreadTranslateButton,\n  getTranslatedThreadTitle,\n} from '@macro/email-translation';\n",
    "message-list translation import"
  )
  c = replace_once!(
    c,
    "title={props.title ?? ''}",
    "title={\n                getTranslatedThreadTitle(\n                  context.thread()?.db_id,\n                  props.title\n                ) ?? ''\n              }",
    "message-list translated title"
  )
  c = replace_once!(
    c,
    "<EmailParticipants />",
    "<div class=\"flex items-center justify-between gap-2\">\n                <EmailParticipants />\n                {/* PRIVATE-HOOK: email_translation:thread */}\n                <EmailThreadTranslateButton\n                  threadId={context.thread()?.db_id}\n                  title={props.title}\n                  messages={context.messages.unfiltered()}\n                />\n              </div>",
    "message-list translation button"
  )
  c
end

rewrite("apps/web/src/features/email-view/components/EmailHeader.tsx") do |c|
  c = insert_after!(c, "import { useSplitPanelOrThrow } from '@components/app/split-layout/layoutUtils';\n", "import { t } from '@macro/i18n';\n", "EmailHeader i18n import")
  c = replace_once!(
    c,
    "const tabTitle = () =>\n    EMAIL_TABS.find((tab) => tab.id === state.tab)?.label ?? 'Email';",
    "const tabTitle = () =>\n    t(EMAIL_TABS.find((tab) => tab.id === state.tab)?.label ?? 'Email');",
    "EmailHeader breadcrumb title"
  )
  c = replace_once!(
    c,
    "const selectedTabLabel = () =>\n    EMAIL_TABS.find((tab) => tab.id === state.tab)?.label ?? 'Email';",
    "const selectedTabLabel = () =>\n    t(EMAIL_TABS.find((tab) => tab.id === state.tab)?.label ?? 'Email');",
    "EmailHeader selected tab"
  )
  c = replace_once!(c, '>Email</span>', ">{t('Email')}</span>", "EmailHeader compact title")
  c = replace_once!(c, 'aria-label="Email location"', "aria-label={t('Email location')}", "EmailHeader breadcrumb aria")
  c = replace_once!(c, "description: 'Search email',", "description: t('Search email@@email'),", "EmailHeader search hotkey")
  c = replace_once!(c, "description: 'Filter email',", "description: t('Filter email@@email'),", "EmailHeader filter hotkey")
  c = replace_once!(c, 'label="New"', "label={t('New')}", "EmailHeader new")
  c = replace_once!(c, 'label="Search email"', "label={t('Search email@@email')}", "EmailHeader search label")
  c = replace_once!(c, 'placeholder="Search email"', "placeholder={t('Search email@@email')}", "EmailHeader search placeholder")
  c
end

rewrite("apps/web/src/features/email-view/components/EmailSidebar.tsx") do |c|
  c = insert_after!(c, "import { useSplitPanelOrThrow } from '@components/app/split-layout/layoutUtils';\n", "import { t } from '@macro/i18n';\n", "EmailSidebar i18n import")
  c = replace_once!(c, "{props.item.label}", "{t(props.item.label)}", "EmailSidebar tab label")
  c = replace_once!(c, 'aria-label="Email tabs"', "aria-label={t('Email tabs@@email')}", "EmailSidebar tabs aria")
  c = replace_once!(c, 'aria-label="Email navigation"', "aria-label={t('Email navigation@@email')}", "EmailSidebar root aria")
  c = replace_once!(c, 'title="Email"', "title={t('Email')}", "EmailSidebar title")
  c = replace_once!(c, 'label="New email"', "label={t('New email@@email')}", "EmailSidebar new email")
  c
end

rewrite("apps/web/src/features/email-view/components/EmailList.tsx") do |c|
  c = insert_after!(
    c,
    "import { useSplitPanelOrThrow } from '@components/app/split-layout/layoutUtils';\n",
    "import { createHotkeyGroup, registerHotkey } from '@core/hotkey/hotkeys';\nimport { TOKENS } from '@core/hotkey/tokens';\n",
    "EmailList hotkey imports"
  )
  c = insert_after!(
    c,
    "} from '@entity';\n",
    "import { createEmailListTranslationHotkey } from '@macro/email-translation';\n",
    "EmailList translation import"
  )
  c = insert_after!(
    c,
    "import { openEntityInSplitFromUnifiedList } from '../../next-soup/utils';\n",
    "import { useEmailListTranslationContext } from '../email-list-translation-context';\n",
    "EmailList translation context import"
  )
  c = insert_after!(
    c,
    "  const panel = useSplitPanelOrThrow();\n",
    "  const translation = useEmailListTranslationContext();\n",
    "EmailList translation context"
  )
  hook = <<~'TS'
    
      // PRIVATE-HOOK: email_translation:email-list-keyboard
      const translationHotkey = createEmailListTranslationHotkey({
        currentView: () => 'mail',
        emailItems: translation.items,
      });
      const translationHotkeyGroup = createHotkeyGroup();
      registerHotkey({
        hotkey: 'q',
        scopeId: panel.splitHotkeyScope,
        hotkeyToken: TOKENS.email.translateList,
        description: 'Translate email list',
        condition: translationHotkey.condition,
        keyDownHandler: translationHotkey.keyDownHandler,
      }).withGroup(translationHotkeyGroup);
      onCleanup(() => translationHotkeyGroup.dispose());

      createEffect(() => {
        translation.setItems(
          rows().flatMap((row) =>
            row.kind === 'entity' && row.entity.type === 'email'
              ? [
                  {
                    id: row.entity.id,
                    name: row.entity.name,
                    snippet: row.entity.snippet,
                  },
                ]
              : []
          )
        );
      });
  TS
  c = insert_after!(c, "  const rows = source.items;\n", hook, "EmailList translation hook")
  c
end

rewrite("apps/web/src/features/email-view/email-view.tsx") do |c|
  c = insert_after!(
    c,
    "import { EmailViewProvider, useEmailView } from './email-view-context';\n",
    "import { EmailListTranslationProvider } from './email-list-translation-context';\n",
    "EmailView translation provider import"
  )
  c = replace_once!(
    c,
    "    <EntityDetailNavigationStack.Root>\n      <ListEntityMetadataQueryProvider>\n",
    "    <EntityDetailNavigationStack.Root>\n      {/* PRIVATE-HOOK: email_translation:view-provider */}\n      <EmailListTranslationProvider>\n        <ListEntityMetadataQueryProvider>\n",
    "EmailView translation provider open"
  )
  c = replace_once!(
    c,
    "      </ListEntityMetadataQueryProvider>\n    </EntityDetailNavigationStack.Root>",
    "        </ListEntityMetadataQueryProvider>\n      </EmailListTranslationProvider>\n    </EntityDetailNavigationStack.Root>",
    "EmailView translation provider close"
  )
  c
end

rewrite("apps/web/src/features/entity/extractors/entity-icon.tsx") do |c|
  c = insert_after!(c, "import { useUserId } from '@core/context/user';\n", "import { useEmailListEnvelopeHighlight } from '@queries/email/readReceipts';\n", "entity-icon receipt import")
  c = insert_after!(c, "import type { StreamEvent } from '@service-connection/generated/schemas';\n", "import { cn } from '@ui';\n", "entity-icon cn import")
  c = insert_after!(
    c,
    "export function EntityIcon(props: EntityIconProps) {\n",
    "  // PRIVATE-HOOK: read_receipts:list-envelope\n  const envelopeHighlight = useEmailListEnvelopeHighlight(() => props.entity);\n",
    "entity-icon receipt hook"
  )
  c = replace_once!(
    c,
    "        <CoreEntityIcon\n          targetType={iconType()}\n          size=\"fill\"\n          class={props.class}\n          weight={props.weight}\n        />",
    "        <CoreEntityIcon\n          targetType={iconType()}\n          size=\"fill\"\n          class={cn(props.class, envelopeHighlight() && '!text-orange')}\n          weight={props.weight}\n        />",
    "entity-icon highlighted fallback"
  )
end

rewrite("apps/web/src/features/settings/ConnectedAccounts.tsx") do |c|
  c = insert_after!(c, "import { usePipedreamMcpFlag } from '@core/pipedream/flag';\n", "import { t } from '@macro/i18n';\n", "ConnectedAccounts i18n import")
  c = replace_once!(c, 'title="Integrations"', "title={t('Integrations')}", "ConnectedAccounts title")
  c = replace_once!(
    c,
    'description="Connect your accounts so Macro can work across the tools you already use."',
    "description={t('Connect your accounts so Macro can work across the tools you already use.')}",
    "ConnectedAccounts description"
  )
  c = replace_once!(c, 'title="Accounts"', "title={t('Accounts')}", "ConnectedAccounts section")
  c
end

rewrite("apps/web/src/lib/core/constant/featureFlags.ts") do |c|
  c = replace_once!(
    c,
    "const parseBooleanOverride = (value: unknown): boolean | undefined =>\n  value === 'true' ? true : value === 'false' ? false : undefined;",
    "const parseBooleanOverride = (value: unknown): boolean | undefined =>\n  typeof value === 'boolean'\n    ? value\n    : value === 'true'\n      ? true\n      : value === 'false'\n        ? false\n        : undefined;",
    "featureFlags boolean parser"
  )
  pattern = /export function getFeatureFlagOverride\(flagName: string\): boolean \| undefined \{\n.*?\n\}/m
  replacement = <<~'TS'.strip
    // PRIVATE-HOOK: selfhost_runtime:feature-flag-overrides
    export function getFeatureFlagOverride(flagName: string): boolean | undefined {
      if (typeof window !== 'undefined') {
        const macroEnv = (
          window as unknown as { __MACRO_ENV__?: Record<string, unknown> }
        ).__MACRO_ENV__;
        if (macroEnv) {
          const runtimeValue = parseBooleanOverride(macroEnv[flagName]);
          if (runtimeValue !== undefined) return runtimeValue;
        }
      }

      return parseBooleanOverride(import.meta.env['VITE_' + flagName]);
    }
  TS
  c = replace_regex_once!(c, pattern, replacement, "featureFlags runtime override")
  addition = <<~'TS'
    
    // PRIVATE-HOOK: selfhost_runtime:direct-attachment-flag
    export const enableDirectAttachmentDownload = defineFlag({
      env: 'ENABLE_DIRECT_ATTACHMENT_DOWNLOAD',
      default: false,
    });

    // PRIVATE-HOOK: selfhost_runtime:capabilities
    export interface AppCapabilities {
      cognition: boolean;
      scheduledActions: boolean;
      agents: boolean;
      docsCollab: boolean;
    }

    export function isSelfHost(): boolean {
      if (typeof window === 'undefined') return false;
      const isLocalBackend =
        import.meta.env.VITE_LOCAL_BACKEND_ORIGIN === 'same-origin' ||
        Boolean(import.meta.env.VITE_LOCAL_BACKEND_ORIGIN);
      const hasMacroEnv = Boolean(
        (window as unknown as { __MACRO_ENV__?: unknown }).__MACRO_ENV__
      );
      const hostname = window.location.hostname;
      const isCustomHost =
        hostname !== 'app.macro.com' &&
        hostname !== 'dev.macro.com' &&
        !hostname.endsWith('.macro.com');
      return isLocalBackend || hasMacroEnv || isCustomHost;
    }

    function getRuntimeFeatures(): Partial<AppCapabilities> | undefined {
      if (typeof window === 'undefined') return undefined;
      return (
        window as unknown as {
          __MACRO_ENV__?: { FEATURES?: Partial<AppCapabilities> };
        }
      ).__MACRO_ENV__?.FEATURES;
    }

    function resolveCapability(
      env: string,
      runtimeValue: boolean | undefined,
      selfHost: boolean
    ): boolean {
      return getFeatureFlagOverride(env) ?? runtimeValue ?? !selfHost;
    }

    export function getAppCapabilities(): AppCapabilities {
      const features = getRuntimeFeatures();
      const selfHost = isSelfHost();
      return {
        cognition: resolveCapability(
          'ENABLE_COGNITION',
          features?.cognition,
          selfHost
        ),
        scheduledActions: resolveCapability(
          'ENABLE_SCHEDULED_ACTIONS',
          features?.scheduledActions,
          selfHost
        ),
        agents: resolveCapability('ENABLE_AGENTS', features?.agents, selfHost),
        docsCollab: resolveCapability(
          'ENABLE_DOCS_COLLAB',
          features?.docsCollab,
          selfHost
        ),
      };
    }
  TS
  c = insert_after!(
    c,
    "export const enableNotificationSettings = defineFlag({\n  key: 'enable-notification-settings',\n  env: 'ENABLE_NOTIFICATION_SETTINGS',\n  default: onInDev,\n});\n",
    addition,
    "featureFlags self-host capabilities"
  )
  c
end

rewrite("apps/web/src/lib/core/constant/settingsTabsConfig.tsx") do |c|
  c = insert_after!(c, "import HardDrivesIcon from '@phosphor/hard-drives.svg';\n", "// PRIVATE-HOOK: self_host_health:settings_icon\nimport HeartbeatIcon from '@phosphor/heartbeat.svg';\n", "settings health icon")
  c = insert_after!(c, "import { type Component, createMemo } from 'solid-js';\n", "import { t } from '@macro/i18n';\n", "settings i18n import")
  c = replace_once!(
    c,
    "items: [{ tab: 'Admin', label: 'Debug', icon: BugIcon }],",
    "items: [\n      { tab: 'Admin', label: 'Debug', icon: BugIcon },\n      // PRIVATE-HOOK: self_host_health:settings_item\n      { tab: 'SelfHostHealth', label: t('Health Check'), icon: HeartbeatIcon },\n    ],",
    "settings health item"
  )
  c = insert_after!(c, "  Admin: 'admin',\n", "  // PRIVATE-HOOK: self_host_health:settings_slug\n  SelfHostHealth: 'health-check',\n", "settings health slug")
  c = replace_once!(
    c,
    "      case 'Admin':\n        return hasAdminPanel();",
    "      case 'Admin':\n      case 'SelfHostHealth':\n        return hasAdminPanel();",
    "settings health availability"
  )
  c
end

rewrite("apps/web/src/lib/queries/sync/SyncProvider.tsx") do |c|
  c = insert_after!(c, "import { WebsocketEvent } from '@macro-inc/collaboration/websocket';\n", "import { queryClient } from '@queries/client';\n", "SyncProvider query client")
  c = insert_after!(c, "import { invalidateContacts } from '@queries/contacts/contacts';\n", "import { handleReadReceiptOpenedEvent } from '@queries/email/readReceipts';\n", "SyncProvider receipt import")
  hook = <<~'TS'
    
          // PRIVATE-HOOK: read_receipts:realtime-event
          .with({ type: 'email_read_receipt_opened' }, () => {
            withParsedWebsocketPayload(data.type, data.data, (payload) => {
              handleReadReceiptOpenedEvent(payload, queryClient);
            });
          })
  TS
  c = insert_after!(
    c,
    "      .with({ type: 'refresh_email' }, () => {\n        withParsedWebsocketPayload(data.type, data.data, handleRefreshEmail);\n      })\n",
    hook,
    "SyncProvider receipt hook"
  )
  c
end

rewrite("services/authentication_service/Cargo.toml") do |c|
  insert_after!(
    c,
    "  \"email\",\n  \"search\",\n",
    "  # PRIVATE-HOOK: self_host_health:auth-sqs-gmail-feature\n  \"gmail\",\n",
    "auth gmail sqs feature"
  )
end

rewrite("services/authentication_service/src/api.rs") do |c|
  c = replace_once!(
    c,
    "        .nest(\n            \"/webhooks\",\n            webhooks::router().layer(axum::middleware::from_fn(\n                macro_middleware::connection_drop_prevention_handler,\n            )),\n        )",
    "        .nest(\n            \"/webhooks\",\n            webhooks::router().layer(axum::middleware::from_fn(\n                macro_middleware::connection_drop_prevention_handler,\n            )),\n        )\n        // PRIVATE-HOOK: self_host_health:admin_route\n        .nest(\n            \"/admin\",\n            crate::features::self_host_health::router(state.clone()),\n        )",
    "auth health admin route"
  )
end

rewrite("services/authentication_service/src/main.rs") do |c|
  c = insert_after!(
    c,
    "mod config;\n",
    "// PRIVATE-HOOK: self_host_health:features\n#[path = \"../../../packages/fork/self-host-health/backend/mod.rs\"]\nmod features;\n",
    "auth health feature module"
  )
  c = insert_after!(
    c,
    "    let email_backfill_queue = macro_queues::EmailBackfillQueue::new();\n",
    "    // PRIVATE-HOOK: self_host_health:gmail_queue_probe_wiring\n    let (\n        gmail_inbox_sync_queue,\n        gmail_inbox_sync_retry_queue,\n        gmail_ops_queue,\n        gmail_ops_retry_queue,\n    ) = crate::features::self_host_health::gmail_probe_queues();\n",
    "auth health gmail queue vars"
  )
  c = replace_once!(
    c,
    "    let sqs_client = sqs_client::SQS::new(aws_sdk_sqs::Client::new(&aws_config))\n        .search_event_queue(&search_event_queue)\n        .email_link_manager_queue(&link_manager_queue)\n        .email_backfill_queue(&email_backfill_queue);",
    "    let sqs_client = sqs_client::SQS::new(aws_sdk_sqs::Client::new(&aws_config))\n        .search_event_queue(&search_event_queue)\n        .email_link_manager_queue(&link_manager_queue)\n        .email_backfill_queue(&email_backfill_queue)\n        .gmail_inbox_sync_queue(&gmail_inbox_sync_queue)\n        .gmail_inbox_sync_retry_queue(&gmail_inbox_sync_retry_queue)\n        .gmail_ops_queue(&gmail_ops_queue)\n        .gmail_ops_retry_queue(&gmail_ops_retry_queue);",
    "auth health gmail queue builder"
  )
  c
end

rewrite("tooling/xtask/crates/xtask_local/src/local/cli/test.rs") do |c|
  hook = <<~'RS'
    
    #[test]
    fn stack_down_rejects_legacy_keep_data_flag() {
        // stack down preserves local user data by default. Reject the legacy
        // flag so scripts cannot imply that data preservation is optional.
        match Cli::try_parse_from(["cargo-x", "stack", "down", "--keep-data"]) {
            Err(err) => assert_eq!(err.kind(), clap::error::ErrorKind::UnknownArgument),
            Ok(_) => panic!("stack down --keep-data must not parse"),
        }
    }
  RS
  c = insert_after!(
    c,
    "fn stack_has_no_snapshot_verb() {\n    match Cli::try_parse_from([\"cargo-x\", \"stack\", \"snapshot\"]) {\n        Err(err) => assert_eq!(err.kind(), clap::error::ErrorKind::InvalidSubcommand),\n        Ok(_) => panic!(\"stack snapshot must not parse\"),\n    }\n}\n",
    hook,
    "xtask data preservation test"
  )
  c
end

# message-card, zigbuild, inventory and local_env intentionally remain upstream.
git!("add", "--", *CONFLICT_PATHS)
unmerged = git!("diff", "--name-only", "--diff-filter=U").lines(chomp: true)
abort "resolver left unmerged paths:\n#{unmerged.join("\n")}" unless unmerged.empty?

puts "Upstream sync conflicts resolved upstream-first."
puts "  target: #{TARGET}"
puts "  reset conflict paths: #{CONFLICT_PATHS.length}"
puts "  orphan SentMessageIndicator removed"
