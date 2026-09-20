import { t } from '@macro/i18n';
import { SYSTEM_PROPERTY_IDS } from '@property/constants';

export type GroupOptionId =
  | 'none'
  | 'date'
  | 'entity_type'
  | 'project'
  | `property:${string}`;

export interface GroupOption {
  value: GroupOptionId;
  label: string;
}

const GROUP_OPTIONS = [
  { value: 'none', label: t('None') },
  { value: 'date', label: t('Date') },
  { value: 'entity_type', label: t('Type') },
  { value: 'project', label: t('Project') },
  { value: `property:${SYSTEM_PROPERTY_IDS.STATUS}`, label: t('Status') },
  { value: `property:${SYSTEM_PROPERTY_IDS.PRIORITY}`, label: t('Priority') },
  { value: `property:${SYSTEM_PROPERTY_IDS.ASSIGNEES}`, label: t('Assignee') },
  { value: 'project', label: t('Project') },
  { value: 'date', label: t('Date') },
] as const satisfies GroupOption[];

const _buildGroupOptions = (
  keys: (typeof GROUP_OPTIONS)[number]['value'][]
) => {
  const options = [];

  for (const key of keys) {
    const option = GROUP_OPTIONS.find((o) => o.value === key);

    if (!option) continue;

    options.push(option);
  }

  return options;
};

const _DEFAULT_GROUP_OPTIONS: GroupOption[] = [
  { value: 'none', label: t('None') },
  { value: 'entity_type', label: t('Type') },
  { value: 'project', label: t('Project') },
];

export const TASK_GROUP_OPTIONS: GroupOption[] = [
  { value: 'none', label: t('None') },
  { value: `property:${SYSTEM_PROPERTY_IDS.STATUS}`, label: t('Status') },
  { value: `property:${SYSTEM_PROPERTY_IDS.PRIORITY}`, label: t('Priority') },
  { value: `property:${SYSTEM_PROPERTY_IDS.ASSIGNEES}`, label: t('Assignee') },
  { value: 'project', label: t('Project') },
  { value: 'date', label: t('Date') },
];

export const COMPANY_GROUP_OPTIONS: GroupOption[] = [
  { value: 'none', label: t('None') },
  { value: `property:${SYSTEM_PROPERTY_IDS.STAGE}`, label: t('Stage') },
  {
    value: `property:${SYSTEM_PROPERTY_IDS.COMPANY_OWNER}`,
    label: t('Owner', 'crm'),
  },
];

export const TAG_VIEW_GROUP_OPTIONS: GroupOption[] = [
  { value: 'none', label: t('None') },
  { value: 'entity_type', label: t('Type') },
  { value: 'project', label: t('Project') },
  { value: 'date', label: t('Date') },
];

const _EMAIL_GROUP_OPTIONS: GroupOption[] = [
  { value: 'none', label: t('None') },
  { value: 'date', label: t('Date') },
  { value: 'project', label: t('Project') },
];

const _INBOX_GROUP_OPTIONS: GroupOption[] = [
  { value: 'none', label: t('None') },
  { value: 'date', label: t('Date') },
  { value: 'entity_type', label: t('Type') },
  { value: 'project', label: t('Project') },
];
