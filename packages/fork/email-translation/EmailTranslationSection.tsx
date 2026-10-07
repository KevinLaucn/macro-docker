import { SettingsRow } from '@app/features/settings/primitives';
import { t } from '@macro/i18n';
import { Button } from '@ui';
import { requestBrowserTranslation } from './browserTranslation';

export function EmailTranslationSection() {
  return (
    <SettingsRow
      label={t('Email translation')}
      description={t("Use your browser's built-in page translation.")}
    >
      <Button variant="outline" size="xs" onClick={requestBrowserTranslation}>
        {t('Translate')}
      </Button>
    </SettingsRow>
  );
}
