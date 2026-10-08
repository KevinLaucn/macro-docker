import { useFeatureFlag } from '@app/lib/analytics/posthog';
import { enableEmailSignatures } from '@core/constant/featureFlags';
import { useSettingsState } from '@core/constant/SettingsState';
import { useSettingsTabAvailable } from '@core/constant/settingsTabsConfig';
import { useUserId } from '@core/context/user';
import { useEmailLinks } from '@core/email-link';
import { t } from '@macro/i18n';
import { Button } from '@ui';
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
          'Connect Gmail accounts and manage their sync with Macro.',
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
            'Create a signature for each of your email accounts. Format text, add links, or insert an image below.',
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
                  'Manage the calendars connected to your Google accounts.',
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
  const links = () =>
    query.isSuccess
      ? query.data.links.filter((link) => link.macro_id === userId())
      : [];
  return (
    <Show
      when={!query.isError}
      fallback={
        <SettingsCard>
          <SettingsRow label={t("Couldn't load signatures", 'email')}>
            <Button variant="outline" onClick={() => void query.refetch()}>
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
              <SignatureSection link={link} />
            </Suspense>
          )}
        </For>
      </Show>
    </Show>
  );
}
