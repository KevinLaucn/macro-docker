import { ENABLE_EMAIL } from '@core/constant/featureFlags';
import { t } from '@macro/i18n';
import { Show, Suspense } from 'solid-js';
import { EmailCard } from './Email';
import { GitHubCard } from './GitHub';
import { IntegrationsSection } from './Integrations';
import { SettingsPage, SettingsSection } from './primitives';

/**
 * Consolidated "Connections" page: one card per external account the user can
 * link (Gmail, GitHub), followed by the agent's MCP integrations.
 */
export function ConnectedAccounts() {
  return (
    <SettingsPage
      title={t('Connections')}
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
      <Suspense>
        <IntegrationsSection />
      </Suspense>
    </SettingsPage>
  );
}
