import { ENABLE_EMAIL } from '@core/constant/featureFlags';
import { t } from '@macro/i18n';
import { Show, Suspense } from 'solid-js';
import { EmailCard } from './Email';
import { GitHubCard } from './GitHub';
import { SettingsPage, SettingsSection } from './primitives';

/** Personal account links. Agent MCP integrations live in Connections. */
export function ConnectedAccounts() {
  return (
    <SettingsPage
      title={t('Integrations')}
      description={t(
        'Connect your accounts so Macro can work across the tools you already use.'
      )}
    >
      <SettingsSection title={t('Accounts')}>
        <div class="flex flex-col gap-3">
          <Show when={ENABLE_EMAIL}>
            <Suspense>
              <EmailCard />
            </Suspense>
          </Show>
          <Suspense>
            <GitHubCard />
          </Suspense>
        </div>
      </SettingsSection>
    </SettingsPage>
  );
}
