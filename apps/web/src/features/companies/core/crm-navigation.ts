import { t } from '@macro/i18n';

export const CRM_VIEWS = [
  {
    id: 'active',
    label: t('All companies', 'crm'),
    description: t('Every visible company in your CRM', 'crm'),
  },
  {
    id: 'my-companies',
    label: t('My companies', 'crm'),
    description: t('Companies assigned to you', 'crm'),
  },
  {
    id: 'needs-follow-up',
    label: t('Needs follow-up', 'crm'),
    description: t(
      'Has a stage other than Churned, with no interaction in the last 14 days',
      'crm'
    ),
  },
  {
    id: 'recently-active',
    label: t('Recently active', 'crm'),
    description: t(
      'Team email activity in the last 7 days. Newly added companies may also appear.',
      'crm'
    ),
  },
  {
    id: 'unassigned',
    label: t('Unassigned', 'crm'),
    description: t('Companies without an owner', 'crm'),
  },
] as const;

export type CrmListConfig = {
  kind: 'crm-list';
  teamId: string;
  companyIds: string[];
};

export function isCrmListConfig(value: unknown): value is CrmListConfig {
  if (typeof value !== 'object' || value === null) return false;
  return (
    'kind' in value &&
    value.kind === 'crm-list' &&
    'teamId' in value &&
    typeof value.teamId === 'string' &&
    'companyIds' in value &&
    Array.isArray(value.companyIds) &&
    value.companyIds.every((id: unknown) => typeof id === 'string')
  );
}

export function matchesInteractionWindow(
  updatedAt: string | Date | null | undefined,
  view: 'needs-follow-up' | 'recently-active',
  now = Date.now()
) {
  if (!updatedAt) return view === 'needs-follow-up';
  const timestamp = new Date(updatedAt).getTime();
  if (!Number.isFinite(timestamp)) return false;
  const age = now - timestamp;
  return view === 'needs-follow-up'
    ? age >= 14 * 86400000
    : age >= 0 && age <= 7 * 86400000;
}

export function needsCompanyFollowUp(
  updatedAt: string | Date | null | undefined,
  stageLabel: string | undefined,
  now = Date.now()
) {
  const stage = stageLabel?.trim().toLowerCase();
  return (
    !!stage &&
    stage !== 'churned' &&
    matchesInteractionWindow(updatedAt, 'needs-follow-up', now)
  );
}
