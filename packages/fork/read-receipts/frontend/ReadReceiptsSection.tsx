import { SettingsRow } from '@app/features/settings/primitives';
import { t } from '@macro/i18n';
import { usePrimaryEmailLinkId } from '@queries/email/link';
import { ToggleSwitch } from '@ui';
import {
  useGlobalExtensionSettingsQuery,
  useSetGlobalOpenTrackingMutation,
} from './queries';

export function ReadReceiptsSection() {
  const primaryLinkId = usePrimaryEmailLinkId();
  const settingsQuery = useGlobalExtensionSettingsQuery(primaryLinkId);
  const setOpenTracking = useSetGlobalOpenTrackingMutation(primaryLinkId);

  const isEnabled = () =>
    settingsQuery.data?.email_open_tracking_enabled ?? true;

  const handleToggle = (checked: boolean) => {
    setOpenTracking.mutate(checked);
  };

  return (
    <SettingsRow
      label={t('Email open tracking')}
      description={t('Show when sent emails are opened.')}
    >
      <ToggleSwitch
        size="md"
        checked={isEnabled()}
        onChange={handleToggle}
        disabled={setOpenTracking.isPending}
      />
    </SettingsRow>
  );
}
