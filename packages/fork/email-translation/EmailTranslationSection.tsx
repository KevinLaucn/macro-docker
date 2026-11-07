import { SettingsRow } from '@app/features/settings/primitives';
import { toast } from '@core/component/Toast/Toast';
import { t } from '@macro/i18n';
import { Button, ToggleSwitch } from '@ui';
import {
  clearClientTranslationStateOnLogout,
  emailTranslationEnabled,
  setEmailTranslationEnabled,
} from './emailTranslationState';

export function EmailTranslationSection() {
  const handleClearCache = () => {
    clearClientTranslationStateOnLogout();
    toast.success(t('本地翻译会话缓存已清理（服务端已保存译文不受影响）'));
  };

  return (
    <SettingsRow
      label={t('Email translation')}
      description={t(
        'Translate email messages, threads, and list previews with AI and save translations permanently.'
      )}
    >
      <div class="flex items-center gap-3">
        <Button
          variant="outline"
          size="xs"
          onClick={handleClearCache}
          class="text-xs text-ink-muted hover:text-ink"
        >
          {t('清理会话缓存')}
        </Button>
        <ToggleSwitch
          size="md"
          checked={emailTranslationEnabled()}
          onChange={(checked) => setEmailTranslationEnabled(checked)}
        />
      </div>
    </SettingsRow>
  );
}
