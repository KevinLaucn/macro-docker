import { SettingsRow } from '@app/features/settings/primitives';
import { t } from '@macro/i18n';
import { usePrimaryEmailLinkId } from '@queries/email/link';
import { ToggleSwitch } from '@ui';
import {
  useGlobalExtensionSettingsQuery,
  useSetGlobalPixelBlockingMutation,
} from './queries';

export function PixelBlockingSection() {
  const primaryLinkId = usePrimaryEmailLinkId();
  const settingsQuery = useGlobalExtensionSettingsQuery(primaryLinkId);
  const setPixelBlocking = useSetGlobalPixelBlockingMutation(primaryLinkId);

  const isEnabled = () =>
    settingsQuery.data?.email_tracking_pixel_blocking_enabled ?? false;

  const handleToggle = (checked: boolean) => {
    setPixelBlocking.mutate(checked);
  };

  return (
    <SettingsRow
      label={t('Block tracking pixels')}
      description={t('Hide tiny tracking images in received emails.')}
    >
      <ToggleSwitch
        size="md"
        checked={isEnabled()}
        onChange={handleToggle}
        disabled={setPixelBlocking.isPending}
      />
    </SettingsRow>
  );
}
