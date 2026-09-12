import { useKeyedPersistentToasts } from '@core/component/Toast/useKeyedPersistentToasts';
import { PERMISSION_IDS } from '@core/constant/permissions';
import { useSettingsState } from '@core/constant/SettingsState';
import { useHasPermission } from '@core/context/user';
import { t } from '@macro/i18n';
import { useSelfHostHealthQuery } from './queries';
import type { HealthCheckItem } from './types';

/**
 * Surfaces a persistent toast for super_admin when critical self-host infrastructure
 * or business contract failures occur. Auto-dismisses when the failure resolves.
 */
export function SelfHostHealthPrompt() {
  const hasAdminPanel = useHasPermission(PERMISSION_IDS.WRITE_ADMIN_PANEL);
  const { openSettings } = useSettingsState();
  const query = useSelfHostHealthQuery({
    enabled: () => hasAdminPanel(),
  });

  useKeyedPersistentToasts<HealthCheckItem>({
    items: () => {
      if (!hasAdminPanel()) return [];
      const report = query.isSuccess ? query.data : undefined;
      if (!report || report.overall_status !== 'critical') return [];
      return report.checks.filter((c) => c.status === 'critical');
    },
    key: (item) => `self-host-health-${item.id}`,
    toast: (item) => ({
      title: t('自托管健康告警: {{name}}', { name: item.name }),
      dismissible: false,
      content(): string {
        return item.message;
      },
      actions: [
        {
          label: t('立即排查'),
          onClick: () => {
            openSettings('SelfHostHealth');
          },
        },
      ],
    }),
  });

  return null;
}
