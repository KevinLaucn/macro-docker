import { toast } from '@core/component/Toast/Toast';
import { t } from '@macro/i18n';
import { useSetContactHiddenMutation } from '@queries/crm/contacts';
import type { CrmContactResponse } from '@service-storage/generated/schemas/crmContactResponse';
import { InlineCheckbox } from '@ui';
import { Show } from 'solid-js';

/**
 * Admin-only (the parent gates the whole section on `useIsTeamAdmin`):
 * if a non-admin can see the contact at all, it's already visible to them.
 */
export function ContactSharingSection(props: { contact?: CrmContactResponse }) {
  const hiddenMutation = useSetContactHiddenMutation();

  const handleToggle = async (
    contact: CrmContactResponse,
    nextShared: boolean
  ) => {
    const willHide = !nextShared;
    try {
      await hiddenMutation.mutateAsync({
        contactId: contact.id,
        hidden: willHide,
      });
      if (willHide) {
        toast.success(t('Contact hidden.'));
      }
    } catch (error) {
      console.error('failed to update contact sharing', error);
      toast.failure(t('Could not update contact visibility'));
    }
  };

  return (
    <Show
      when={props.contact}
      fallback={<div class="text-xs text-ink-muted">{t('Loading…')}</div>}
    >
      {(contact) => {
        const isShared = () => !contact().hidden;
        return (
          <div class="flex flex-col gap-4 text-xs">
            <div class="flex flex-col gap-2">
              <button
                type="button"
                role="checkbox"
                aria-checked={isShared()}
                disabled={hiddenMutation.isPending}
                onClick={() => void handleToggle(contact(), !isShared())}
                class="inline-flex h-7 w-fit select-none items-center gap-2 rounded-md border border-ink-muted/[0.08] bg-ink-muted/[0.025] px-2.5 text-xs text-ink hover:bg-ink-muted/[0.06]"
              >
                <InlineCheckbox checked={isShared()} />
                <span class="whitespace-nowrap">{t('Visible in CRM')}</span>
              </button>
              <p class="text-ink-muted leading-5">
                {t(
                  "Shows this contact in their company's contact list. Hide contacts that aren't relevant to your team's CRM."
                )}
              </p>
            </div>
          </div>
        );
      }}
    </Show>
  );
}
