import { t } from '@macro/i18n';
import type { EmailTab } from './types';

export type EmailTabItem = {
  id: EmailTab;
  label: string;
};

export const EMAIL_TABS: EmailTabItem[] = [
  { id: 'important', label: t('Signal') },
  { id: 'noise', label: t('Noise') },
  { id: 'sent', label: t('Sent') },
  { id: 'calendar', label: t('Calendar') },
  { id: 'drafts', label: t('Drafts') },
  { id: 'shared', label: t('Shared') },
  { id: 'all', label: t('All') },
];

export const EMAIL_TAB_IDS: EmailTab[] = EMAIL_TABS.map((tab) => tab.id);

export const DEFAULT_EMAIL_TAB: EmailTab = 'important';
