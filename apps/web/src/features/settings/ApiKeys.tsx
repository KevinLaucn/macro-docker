import { CredentialField } from '@channel/Bots/CredentialField';
import { LoadingSpinner } from '@core/component/LoadingSpinner';
import { toast } from '@core/component/Toast/Toast';
import { formatRelativeTimestamp } from '@entity';
import { t } from '@macro/i18n';
import KeyIcon from '@phosphor/key.svg';
import PlusIcon from '@phosphor/plus.svg';
import SpinnerIcon from '@phosphor/spinner.svg';
import TrashIcon from '@phosphor/trash.svg';
import XIcon from '@phosphor/x.svg';
import {
  MAX_USER_API_KEYS,
  normalizeUserApiKeyName,
} from '@queries/user-api-keys/name';
import {
  useCreateUserApiKeyMutation,
  useDeleteUserApiKeyMutation,
  useUserApiKeysQuery,
} from '@queries/user-api-keys/user-api-keys';
import type { CreatedUserApiKey } from '@service-storage/generated/schemas/createdUserApiKey';
import type { UserApiKeyInfo } from '@service-storage/generated/schemas/userApiKeyInfo';
import { Button, Dialog, Panel, Tooltip } from '@ui';
import { createSignal, For, type JSX, Show } from 'solid-js';
import { SettingsCard, SettingsPage, SettingsSection } from './primitives';

const USER_API_KEY_HEADER = 'x-macro-user-api-key';

export function ApiKeys() {
  const keysQuery = useUserApiKeysQuery();
  const createKey = useCreateUserApiKeyMutation();
  const deleteKey = useDeleteUserApiKeyMutation();
  const [createOpen, setCreateOpen] = createSignal(false);
  const [pendingDelete, setPendingDelete] = createSignal<UserApiKeyInfo | null>(
    null
  );

  const keys = () => keysQuery.data ?? [];
  const atLimit = () => keys().length >= MAX_USER_API_KEYS;
  const createDisabled = () => keysQuery.isLoading || atLimit();

  const openCreate = () => {
    if (createDisabled()) return;
    setCreateOpen(true);
  };

  return (
    <SettingsPage
      title={t('API Keys')}
      description={t(
        'Authenticate as yourself from scripts and integrations. Send the key in the {header} header. The secret is shown only once when you create a key.',
        {
          header: USER_API_KEY_HEADER,
        }
      )}
      actions={
        <Tooltip
          label={t('You can have at most {max} API keys', {
            max: MAX_USER_API_KEYS,
          })}
          disabled={!atLimit()}
        >
          <Button
            variant="cta"
            size="sm"
            disabled={createDisabled()}
            onClick={openCreate}
          >
            <PlusIcon />
            {t('Create key')}
          </Button>
        </Tooltip>
      }
    >
      <SettingsSection
        title={t('Your keys')}
        description={t(
          'Up to {max} keys. Anyone with a key can act as you, so treat them like passwords.',
          { max: MAX_USER_API_KEYS }
        )}
      >
        <SettingsCard>
          <Show
            when={!keysQuery.isLoading}
            fallback={
              <div class="flex min-h-36 items-center justify-center">
                <LoadingSpinner class="size-10 p-2" />
              </div>
            }
          >
            <Show
              when={!keysQuery.isError}
              fallback={
                <div class="px-6 py-8 text-center text-sm text-ink-muted">
                  {t('Couldn’t load API keys.')}
                </div>
              }
            >
              <Show
                when={keys().length > 0}
                fallback={
                  <div class="flex min-h-52 flex-col items-center justify-center px-8 text-center">
                    <div class="flex size-11 items-center justify-center rounded-xl bg-accent-bg text-accent">
                      <KeyIcon class="size-6" />
                    </div>
                    <div class="mt-3 text-sm font-medium text-ink">
                      {t('Create your first API key')}
                    </div>
                    <div class="mt-1 max-w-80 text-xs text-ink-muted">
                      {t(
                        'Use a key to call Macro on your behalf. The full secret is shown only at creation.'
                      )}
                    </div>
                    <Button
                      class="mt-4"
                      variant="cta"
                      size="sm"
                      onClick={openCreate}
                    >
                      <PlusIcon />
                      {t('Create key')}
                    </Button>
                  </div>
                }
              >
                <For each={keys()}>
                  {(key) => (
                    <ApiKeyRow
                      keyInfo={key}
                      deleting={
                        deleteKey.isPending && pendingDelete()?.id === key.id
                      }
                      onDelete={() => setPendingDelete(key)}
                    />
                  )}
                </For>
              </Show>
            </Show>
          </Show>
        </SettingsCard>
      </SettingsSection>

      <CreateApiKeyDialog
        open={createOpen()}
        pending={createKey.isPending}
        onCreate={async (name) => {
          try {
            return await createKey.mutateAsync({ name });
          } catch (error) {
            toast.failure(
              error instanceof Error
                ? error.message
                : t('Failed to create API key')
            );
            return undefined;
          }
        }}
        onClose={() => setCreateOpen(false)}
      />

      <ConfirmDialog
        open={pendingDelete() !== null}
        title={t('Delete API key')}
        confirmLabel={t('Delete key')}
        pending={deleteKey.isPending}
        danger
        onConfirm={async () => {
          const key = pendingDelete();
          if (!key) return;
          try {
            await deleteKey.mutateAsync({ id: key.id });
            toast.success(t('API key deleted'));
            setPendingDelete(null);
          } catch {
            toast.failure(t('Failed to delete API key'));
          }
        }}
        onClose={() => !deleteKey.isPending && setPendingDelete(null)}
      >
        <Show when={pendingDelete()}>
          {(key) =>
            t(
              'Delete {name}? This cannot be undone. Anything using this key will stop working.',
              {
                name: key().name,
              }
            )
          }
        </Show>
      </ConfirmDialog>
    </SettingsPage>
  );
}

function ApiKeyRow(props: {
  keyInfo: UserApiKeyInfo;
  deleting: boolean;
  onDelete: () => void;
}) {
  return (
    <div class="flex min-h-14 items-center gap-3 px-6 py-3.5">
      <div class="min-w-0 flex-1">
        <div class="truncate text-sm font-medium text-ink">
          {props.keyInfo.name}
        </div>
        <div
          class="mt-0.5 text-xs text-ink-extra-muted"
          title={props.keyInfo.createdAt}
        >
          {t('Created {time}', {
            time: formatRelativeTimestamp(props.keyInfo.createdAt),
          })}
        </div>
      </div>
      <Tooltip label={t('Delete key')}>
        <button
          type="button"
          aria-label={t('Delete {name}', { name: props.keyInfo.name })}
          class="flex size-7 shrink-0 items-center justify-center rounded-md text-ink-extra-muted outline-none hover:bg-failure/10 hover:text-failure focus-visible:border focus-visible:border-failure disabled:opacity-30"
          disabled={props.deleting}
          onClick={props.onDelete}
        >
          <Show when={props.deleting} fallback={<TrashIcon class="size-4" />}>
            <SpinnerIcon class="size-4 animate-spin" />
          </Show>
        </button>
      </Tooltip>
    </div>
  );
}

function CreateApiKeyDialog(props: {
  open: boolean;
  pending: boolean;
  onCreate: (name: string) => Promise<CreatedUserApiKey | undefined>;
  onClose: () => void;
}) {
  const [name, setName] = createSignal('');
  const [created, setCreated] = createSignal<CreatedUserApiKey>();
  const [nameError, setNameError] = createSignal<string>();

  const reset = () => {
    setName('');
    setCreated(undefined);
    setNameError(undefined);
  };

  const close = () => {
    if (props.pending) return;
    props.onClose();
    reset();
  };

  const submit = async () => {
    if (props.pending || created()) return;
    const normalized = normalizeUserApiKeyName(name());
    if (!normalized.ok) {
      setNameError(normalized.error);
      return;
    }
    setNameError(undefined);
    const result = await props.onCreate(normalized.name);
    if (result) setCreated(result);
  };

  return (
    <Dialog
      open={props.open}
      onOpenChange={(open) => (open ? undefined : close())}
      onEscapeKeyDown={(event) => props.pending && event.preventDefault()}
      position="center"
      class="w-105"
    >
      <Panel depth={2} active class="rounded-xl text-ink">
        <Panel.Header class="px-5">
          <Dialog.Title class="text-sm font-semibold">
            {created() ? t('API key created') : t('New API key')}
          </Dialog.Title>
          <div class="ml-auto">
            <Button
              variant="ghost"
              size="icon-sm"
              label={t('Close')}
              aria-label={t('Close')}
              disabled={props.pending}
              onClick={close}
            >
              <XIcon />
            </Button>
          </div>
        </Panel.Header>
        <Panel.Body class="p-5">
          <Show
            when={created()}
            fallback={
              <div class="flex flex-col gap-5">
                <label class="flex flex-col gap-1.5">
                  <span class="text-xs font-medium text-ink">{t('Name')}</span>
                  <input
                    autofocus
                    value={name()}
                    placeholder={t('e.g. CI, local scripts')}
                    class="settings-input w-full"
                    aria-invalid={nameError() ? true : undefined}
                    onInput={(event) => {
                      setName(event.currentTarget.value);
                      setNameError(undefined);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') void submit();
                    }}
                  />
                  <Show
                    when={nameError()}
                    fallback={
                      <span class="text-xs text-ink-muted">
                        {t('A label so you can tell keys apart later.')}
                      </span>
                    }
                  >
                    {(error) => (
                      <span class="text-xs text-failure">{error()}</span>
                    )}
                  </Show>
                </label>
                <div class="flex justify-end gap-2 border-t border-edge-muted pt-4">
                  <Button variant="ghost" size="sm" onClick={close}>
                    {t('Cancel')}
                  </Button>
                  <Button
                    variant="cta"
                    size="sm"
                    disabled={props.pending}
                    onClick={() => void submit()}
                  >
                    {props.pending ? t('Creating…') : t('Create key')}
                  </Button>
                </div>
              </div>
            }
          >
            {(key) => (
              <div class="flex flex-col gap-5">
                <CredentialField
                  label={t('API key')}
                  value={key().key}
                  help={t('Shown only once')}
                />
                <div class="rounded-lg border border-alert/30 bg-alert-bg px-3 py-2.5 text-xs text-alert-ink">
                  {t(
                    'Store this key somewhere secure before closing. Send it as {header}.',
                    { header: USER_API_KEY_HEADER }
                  )}
                </div>
                <div class="flex justify-end border-t border-edge-muted pt-4">
                  <Button variant="cta" size="sm" onClick={close}>
                    {t('Done')}
                  </Button>
                </div>
              </div>
            )}
          </Show>
        </Panel.Body>
      </Panel>
    </Dialog>
  );
}

function ConfirmDialog(props: {
  open: boolean;
  title: string;
  confirmLabel: string;
  pending: boolean;
  danger?: boolean;
  onConfirm: () => void;
  onClose: () => void;
  children: JSX.Element;
}) {
  return (
    <Dialog
      open={props.open}
      onOpenChange={(open) => !open && !props.pending && props.onClose()}
    >
      <Panel depth={2} class="max-h-[75vh] rounded-xl text-ink">
        <Panel.Header class="gap-1 px-2">
          <Dialog.CloseButton
            as={Button}
            variant="ghost"
            size="icon-sm"
            disabled={props.pending}
          >
            <XIcon />
          </Dialog.CloseButton>
          <Dialog.Title as="span" class="m-0 p-0 text-sm font-medium">
            {props.title}
          </Dialog.Title>
        </Panel.Header>
        <Panel.Body class="flex flex-col gap-3 p-3">
          <p class="text-sm text-ink-muted">{props.children}</p>
          <div class="flex justify-end gap-1 pt-2">
            <Button
              variant="ghost"
              class="rounded-xs"
              disabled={props.pending}
              onClick={props.onClose}
            >
              {t('Cancel')}
            </Button>
            <Button
              variant={props.danger ? 'danger' : 'accent'}
              class="rounded-xs"
              disabled={props.pending}
              onClick={props.onConfirm}
            >
              <Show when={props.pending} fallback={props.confirmLabel}>
                <SpinnerIcon class="size-4 animate-spin" />
              </Show>
            </Button>
          </div>
        </Panel.Body>
      </Panel>
    </Dialog>
  );
}
