import type { ListView } from '@app/constants/list-views';
import type { TabItem } from '@core/component/Tabs';
import { t } from '@macro/i18n';

/** Views that have tab definitions. Shared between VIEW_TAB_LISTS and VIEW_TAB_PRESETS. */
export type TabbedListView = Extract<
  ListView,
  | 'inbox'
  | 'agents'
  | 'mail'
  | 'documents'
  | 'tasks'
  | 'channels'
  | 'calls'
  | 'folders'
  | 'reminders'
>;

/** Tab definitions for each list view. */
export const VIEW_TAB_LISTS: Record<TabbedListView, TabItem[]> = {
  inbox: [
    { value: 'signal', label: t('Signal') },
    { value: 'noise', label: t('Noise') },
    { value: 'all', label: t('All') },
    // Hidden from every tab surface for unflagged users (see
    // `useVisibleViewTabs`); listed here so the tab/preset consistency tests
    // still cover it.
    { value: 'reminders', label: t('Reminders') },
  ],
  agents: [
    { value: 'owned', label: t('Owned') },
    { value: 'running', label: t('Running') },
    { value: 'shared', label: t('Shared') },
    { value: 'automations', label: t('Automations') },
    { value: 'skills', label: t('Skills') },
  ],
  mail: [
    { value: 'important', label: t('Signal') },
    { value: 'noise', label: t('Noise') },
    { value: 'sent', label: t('Sent') },
    { value: 'calendar', label: t('Calendar') },
    { value: 'drafts', label: t('Drafts') },
    { value: 'shared', label: t('Shared') },
    { value: 'all', label: t('All') },
  ],
  documents: [
    { value: 'owned', label: t('Owned') },
    { value: 'shared', label: t('Shared') },
    { value: 'attachments', label: t('Attachments') },
    { value: 'folders', label: t('Folders') },
    { value: 'all', label: t('All') },
  ],
  tasks: [
    { value: 'my-tasks', label: t('My tasks') },
    { value: 'all', label: t('All') },
  ],
  channels: [
    { value: 'recent', label: t('Recent') },
    { value: 'people', label: t('People') },
    { value: 'teams', label: t('Teams') },
  ],
  calls: [
    { value: 'all', label: t('All') },
    { value: 'missed', label: t('Missed') },
    { value: 'unattended', label: t('Unattended') },
  ],
  folders: [
    { value: 'owned', label: t('Owned') },
    { value: 'all', label: t('All') },
  ],
  reminders: [
    { value: 'active', label: t('Active') },
    { value: 'scheduled', label: t('Scheduled') },
    { value: 'done', label: t('Done') },
  ],
};
