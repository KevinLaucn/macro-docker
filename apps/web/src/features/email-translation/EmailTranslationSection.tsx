import { SettingsRow } from '@app/features/settings/primitives';
import { t } from '@macro/i18n';
import { ToggleSwitch } from '@ui';
import {
  emailTranslationEnabled,
  setEmailTranslationEnabled,
} from './emailTranslationState';
import { isTranslationSupported } from './translatorClient';

export function EmailTranslationSection() {
  const supported = () => isTranslationSupported();

  return (
    <SettingsRow
      label={t('Email translation')}
      description={
        supported()
          ? t(
              'Translate email previews and contents on demand using on-device AI.'
            )
          : t(
              'On-device translation is not supported in this browser (Chrome 138+ recommended).'
            )
      }
    >
      <ToggleSwitch
        size="md"
        checked={emailTranslationEnabled()}
        onChange={(checked) => setEmailTranslationEnabled(checked)}
        disabled={!supported()}
      />
    </SettingsRow>
  );
}
