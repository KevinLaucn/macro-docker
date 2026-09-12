import { SettingsRow } from '@app/features/settings/primitives';
import { toast } from '@core/component/Toast/Toast';
import { t } from '@macro/i18n';
import { Button, ToggleSwitch } from '@ui';
import {
  emailTranslationEnabled,
  setEmailTranslationEnabled,
} from './emailTranslationState';
import { clearTranslationCache } from './translationCache';
import { isTranslationSupported } from './translatorClient';

export function EmailTranslationSection() {
  const supported = () => isTranslationSupported();

  const handleClearCache = () => {
    clearTranslationCache();
    toast.success(t('翻译缓存已清理'));
  };

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
      <div class="flex items-center gap-3">
        <Button
          variant="outline"
          size="xs"
          onClick={handleClearCache}
          class="text-xs text-ink-muted hover:text-ink"
        >
          {t('清理缓存')}
        </Button>
        <ToggleSwitch
          size="md"
          checked={emailTranslationEnabled()}
          onChange={(checked) => setEmailTranslationEnabled(checked)}
          disabled={!supported()}
        />
      </div>
    </SettingsRow>
  );
}
