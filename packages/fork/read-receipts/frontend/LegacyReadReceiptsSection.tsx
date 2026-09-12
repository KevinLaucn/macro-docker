import { toast } from '@core/component/Toast/Toast';
import type { Link as EmailLink } from '@service-email/generated/schemas';
import { ToggleSwitch } from '@ui';
import {
  useReadReceiptsPreferenceQuery,
  useSetReadReceiptsPreferenceMutation,
} from './legacy-queries';

/** Per-inbox open-tracking preference for mail the user sends. */
export function LegacyReadReceiptsSection(props: { link: EmailLink }) {
  const preference = useReadReceiptsPreferenceQuery(() => props.link.id);
  const updatePreference = useSetReadReceiptsPreferenceMutation(
    () => props.link.id
  );

  const checked = () => preference.data?.read_receipts_enabled ?? true;

  const setEnabled = (enabled: boolean) => {
    updatePreference.mutate(enabled, {
      onSuccess: () => {
        void preference.refetch();
      },
      onError: () => {
        toast.failure('Failed to update email read receipts.');
        void preference.refetch();
      },
    });
  };

  return (
    <div class="flex items-center justify-between gap-4 rounded-xl border border-edge-muted px-3 py-3">
      <div class="min-w-0 flex flex-col gap-0.5">
        <span class="text-sm text-ink">Email read receipts</span>
        <span class="text-xs text-ink-muted">
          See when recipients open emails you send.
        </span>
      </div>
      <ToggleSwitch
        checked={checked()}
        disabled={preference.isPending || updatePreference.isPending}
        onChange={setEnabled}
        label={
          <span class="sr-only">
            Email read receipts for {props.link.email_address}
          </span>
        }
      />
    </div>
  );
}
