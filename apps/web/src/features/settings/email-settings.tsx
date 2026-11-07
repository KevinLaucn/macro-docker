import { useFeatureFlag } from '@app/lib/analytics/posthog';
import { toast } from '@core/component/Toast/Toast';
import {
  enableEmailReadReceipts,
  enableEmailSignatures,
} from '@core/constant/featureFlags';
import { useSettingsState } from '@core/constant/SettingsState';
import { useSettingsTabAvailable } from '@core/constant/settingsTabsConfig';
import { useUserId } from '@core/context/user';
import { useEmailLinks } from '@core/email-link';
import { fireAndForget } from '@core/util/fireAndForget';
import { t } from '@macro/i18n';
import { useUpdateEmailSettingsMutation } from '@queries/email/settings';
import type { Link as EmailLink } from '@service-email/generated/schemas';
import { Button, ToggleSwitch } from '@ui';
import { For, Show, Suspense } from 'solid-js';
import { EmailCard } from './Email';
import {
  SettingsCard,
  SettingsPage,
  SettingsRow,
  SettingsSection,
} from './primitives';
import { SignatureSection } from './SignatureSection';

export function EmailSettings() {
  const signatures = useFeatureFlag(enableEmailSignatures);
  const readReceipts = useFeatureFlag(enableEmailReadReceipts);
  const { openSettings } = useSettingsState();
  const isAvailable = useSettingsTabAvailable();
  return (
    <SettingsPage
      title={t('Email', 'email')}
      description={t(
        'Manage your inboxes and the signature you send with each account.',
        'email'
      )}
    >
      <SettingsSection
        title={t('Accounts', 'email')}
        description={t(
          'Connect email accounts and manage their sync with Macro.',
          'email'
        )}
      >
        <Suspense
          fallback={
            <p role="status" class="text-sm text-ink-muted">
              {t('Loading accounts…', 'email')}
            </p>
          }
        >
          <EmailCard />
        </Suspense>
      </SettingsSection>
      <Show when={signatures().enabled}>
        <SettingsSection
          title={t('Signatures', 'email')}
          description={t(
            'Create a signature for each email account and preview it before sending.',
            'email'
          )}
        >
          <Suspense
            fallback={
              <p role="status" class="text-sm text-ink-muted">
                {t('Loading signatures…', 'email')}
              </p>
            }
          >
            <EmailSignatures />
          </Suspense>
        </SettingsSection>
      </Show>
      <Show when={readReceipts().enabled}>
        <SettingsSection
          title="Read receipts"
          description="See when recipients open messages you send."
        >
          <Suspense
            fallback={
              <p role="status" class="text-sm text-ink-muted">
                Loading accounts…
              </p>
            }
          >
            <EmailReadReceipts />
          </Suspense>
        </SettingsSection>
      </Show>
      <Show when={isAvailable('Notifications') || isAvailable('Calendar')}>
        <SettingsSection title={t('Related settings', 'email')}>
          <SettingsCard>
            <Show when={isAvailable('Notifications')}>
              <SettingsRow
                stackOnNarrow
                label={t('Email notifications', 'email')}
                description={t(
                  'Choose your email alerts and digest delivery.',
                  'email'
                )}
              >
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => openSettings('Notifications')}
                >
                  {t('Manage notifications', 'email')}
                </Button>
              </SettingsRow>
            </Show>
            <Show when={isAvailable('Calendar')}>
              <SettingsRow
                stackOnNarrow
                label={t('Calendars', 'email')}
                description={t(
                  'Manage the calendars connected to your email accounts.',
                  'email'
                )}
              >
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => openSettings('Calendar')}
                >
                  {t('Manage calendars', 'email')}
                </Button>
              </SettingsRow>
            </Show>
          </SettingsCard>
        </SettingsSection>
      </Show>
    </SettingsPage>
  );
}

function EmailSignatures() {
  const userId = useUserId();
  const { query } = useEmailLinks();
  const links = () => (query.isSuccess ? query.data.links : []);
  return (
    <Show
      when={!query.isError}
      fallback={
        <SettingsCard>
          <SettingsRow label={t("Couldn't load signatures", 'email')}>
            <Button
              variant="secondary"
              onClick={() => fireAndForget(query.refetch(), 'email-settings')}
            >
              {t('Try again', 'email')}
            </Button>
          </SettingsRow>
        </SettingsCard>
      }
    >
      <Show
        when={!query.isPending}
        fallback={
          <p role="status" class="text-sm text-ink-muted">
            {t('Loading signatures…', 'email')}
          </p>
        }
      >
        <For
          each={links()}
          fallback={
            <SettingsCard>
              <SettingsRow
                label={t(
                  'Connect an email account above to add a signature.',
                  'email'
                )}
              />
            </SettingsCard>
          }
        >
          {(link) => (
            <Suspense
              fallback={
                <p role="status" class="text-sm text-ink-muted">
                  {t('Loading signature…', 'email')}
                </p>
              }
            >
              <SignatureSection
                link={link}
                shared={link.macro_id !== userId()}
              />
            </Suspense>
          )}
        </For>
      </Show>
    </Show>
  );
}

function EmailReadReceipts() {
  const userId = useUserId();
  const { query } = useEmailLinks();
  const links = () =>
    (query.data?.links ?? []).filter((link) => link.macro_id === userId());
  return (
    <Show
      when={!query.isPending}
      fallback={
        <p role="status" class="text-sm text-ink-muted">
          Loading accounts…
        </p>
      }
    >
      <Show
        when={query.data}
        fallback={
          <SettingsCard>
            <SettingsRow label="Couldn't load accounts">
              <Button
                variant="outline"
                onClick={() => fireAndForget(query.refetch(), 'email-settings')}
              >
                Try again
              </Button>
            </SettingsRow>
          </SettingsCard>
        }
      >
        <SettingsCard>
          <For
            each={links()}
            fallback={
              <SettingsRow label="Connect an email account above to use read receipts." />
            }
          >
            {(link) => <ReadReceiptsRow link={link} />}
          </For>
        </SettingsCard>
      </Show>
    </Show>
  );
}

function ReadReceiptsRow(props: { link: EmailLink }) {
  const updateSettings = useUpdateEmailSettingsMutation();
  return (
    <SettingsRow label={props.link.email_address}>
      <ToggleSwitch
        size="md"
        label={`Read receipts for ${props.link.email_address}`}
        labelClass="sr-only"
        checked={props.link.settings.read_receipts_enabled ?? true}
        disabled={updateSettings.isPending}
        onChange={(checked) =>
          updateSettings.mutate(
            {
              linkId: props.link.id,
              settings: { read_receipts_enabled: checked },
            },
            { onError: () => toast.failure('Failed to update read receipts.') }
          )
        }
      />
    </SettingsRow>
  );
}
