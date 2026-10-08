import {
  SettingsButton as Button,
  SettingsCard,
  SettingsRow,
  SettingsSection,
} from '@app/features/settings/primitives';
import { t } from '@macro/i18n';
import PlusIcon from '@phosphor/plus.svg';
import { Checkbox } from '@ui';
import { Index, Show } from 'solid-js';
import type { CalendarSource } from '../types';
import { CalendarColorPicker } from './calendar-color-picker';

export interface ConnectedCalendarAccount {
  id: string;
  email: string;
  calendars: CalendarSource[];
  needsPermission: boolean;
  canManage: boolean;
  defaultColor?: string;
}

export function ConnectedCalendars(props: {
  accounts: ConnectedCalendarAccount[];
  loading: boolean;
  error: boolean;
  connecting: boolean;
  canConnect: boolean;
  onRetry: () => void;
  onConnect: () => void;
  onEnable: () => void;
  onDisconnect: (account: ConnectedCalendarAccount) => void;
  isVisible: (id: string) => boolean;
  onVisibilityChange: (ids: string[], visible: boolean) => void;
  accountColor: (id: string) => string | undefined;
  sourceColor: (id: string) => string | undefined;
  onAccountColor: (id: string, color: string | undefined) => void;
  onSourceColor: (id: string, color: string | undefined) => void;
}) {
  return (
    <SettingsSection
      title={t('Connected calendars')}
      description={t(
        'Connect your accounts and choose which calendars appear in Macro.'
      )}
    >
      <SettingsCard>
        <SettingsRow
          label={t('Google Calendar')}
          description={t('Keep work and personal calendars together.')}
        >
          <Show when={props.canConnect}>
            <Button
              size="sm"
              variant="outline"
              disabled={props.connecting}
              onClick={props.onConnect}
            >
              <PlusIcon class="size-4" />
              {props.connecting ? t('Connecting…') : t('Connect account')}
            </Button>
          </Show>
        </SettingsRow>
        <Show when={props.loading}>
          <p role="status" class="px-6 py-4 text-sm text-ink-muted">
            {t('Loading calendars…')}
          </p>
        </Show>
        <Show when={props.error}>
          <div
            role="alert"
            class="flex items-center justify-between gap-3 px-6 py-4 text-sm text-ink-muted"
          >
            {t('Could not load calendars.')}
            <Button size="sm" variant="outline" onClick={props.onRetry}>
              {t('Retry')}
            </Button>
          </div>
        </Show>
        <Index each={props.accounts}>
          {(account) => {
            const visibleCount = () =>
              account().calendars.filter((c) => props.isVisible(c.id)).length;
            const primary = () =>
              account().calendars.find((c) => c.isPrimary) ??
              account().calendars[0];
            return (
              <div class="px-6 py-4">
                <div class="flex flex-wrap items-center gap-3">
                  <Checkbox
                    class="flex min-w-0 flex-1 items-center gap-3"
                    checked={
                      account().calendars.length > 0 &&
                      visibleCount() === account().calendars.length
                    }
                    indeterminate={
                      visibleCount() > 0 &&
                      visibleCount() < account().calendars.length
                    }
                    disabled={!account().calendars.length}
                    onChange={(visible) =>
                      props.onVisibilityChange(
                        account().calendars.map((c) => c.id),
                        visible
                      )
                    }
                  >
                    <Checkbox.Control />
                    <Checkbox.Label class="min-w-0 break-all text-sm font-medium">
                      {account().email}
                    </Checkbox.Label>
                  </Checkbox>
                  <Show when={account().calendars.length}>
                    <CalendarColorPicker
                      label={t('Default color for {email}', {
                        email: account().email,
                      })}
                      color={
                        props.accountColor(account().id) ??
                        account().defaultColor ??
                        primary()?.color ??
                        'var(--color-accent)'
                      }
                      overridden={!!props.accountColor(account().id)}
                      onChange={(color) =>
                        props.onAccountColor(account().id, color)
                      }
                    />
                  </Show>
                  <Show when={account().canManage}>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={props.connecting}
                      onClick={() =>
                        account().needsPermission
                          ? props.onEnable()
                          : props.onDisconnect(account())
                      }
                    >
                      {account().needsPermission
                        ? t('Connect calendar')
                        : t('Disconnect')}
                    </Button>
                  </Show>
                </div>
                <Show when={!account().calendars.length}>
                  <p class="mt-2 pl-7 text-xs text-ink-muted">
                    {account().needsPermission
                      ? t('Connect to give Macro access to this calendar.')
                      : t('Your calendars will appear here after syncing.')}
                  </p>
                </Show>
                <div class="mt-2 flex flex-col gap-1 pl-7">
                  <Index each={account().calendars}>
                    {(calendar) => (
                      <div class="flex items-center gap-3 py-2">
                        <Checkbox
                          class="flex min-w-0 flex-1 items-center gap-3"
                          checked={props.isVisible(calendar().id)}
                          onChange={(visible) =>
                            props.onVisibilityChange([calendar().id], visible)
                          }
                        >
                          <Checkbox.Control />
                          <Checkbox.Label class="min-w-0 text-sm text-ink-muted">
                            <span class="break-words">{calendar().name}</span>
                            <Show when={calendar().isPrimary}>
                              <span class="ml-2 text-xs text-ink-extra-muted">
                                {t('Primary')}
                              </span>
                            </Show>
                            <Show when={calendar().syncError}>
                              <span class="block text-xs text-failure">
                                {t('Sync failed: {syncError}', {
                                  syncError: calendar().syncError,
                                })}
                              </span>
                            </Show>
                          </Checkbox.Label>
                        </Checkbox>
                        <CalendarColorPicker
                          label={t('Color for {name} ({email})', {
                            name: calendar().name,
                            email: account().email,
                          })}
                          color={calendar().color}
                          overridden={!!props.sourceColor(calendar().id)}
                          onChange={(color) =>
                            props.onSourceColor(calendar().id, color)
                          }
                        />
                      </div>
                    )}
                  </Index>
                </div>
              </div>
            );
          }}
        </Index>
      </SettingsCard>
      <p class="px-6 text-xs text-ink-extra-muted">
        {t(
          'Visibility and colors are saved in this browser. Hiding a calendar does not disconnect it or change your booking availability.'
        )}
      </p>
    </SettingsSection>
  );
}
