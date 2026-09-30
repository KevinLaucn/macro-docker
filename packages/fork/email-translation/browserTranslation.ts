import { toast } from '@core/component/Toast/Toast';
import { t } from '@macro/i18n';

/**
 * The browser owns the native page-translation surface. Web pages cannot open
 * Chrome's translation popup through a public API, so keep the app action as a
 * lightweight affordance that points the user to that control.
 */
export function requestBrowserTranslation(): void {
  toast.info(t('请点击浏览器地址栏中的翻译按钮')); 
}
