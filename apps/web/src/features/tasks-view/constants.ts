import type { SortDefinition } from '@app/features/soup';
import { compareDateDesc } from '@core/util/date';
import type { TaskEntityWithProperties } from '@entity';
import { t } from '@macro/i18n';
import type { TaskGroupBy, TaskSortId, TaskTab } from './types';

export type TaskTabItem = {
  id: TaskTab;
  label: string;
};

export const PERSONAL_TASK_TABS: TaskTabItem[] = [
  { id: 'my-tasks', label: t('My tasks') },
  { id: 'created-by-me', label: t('Created by me') },
];

export const TEAM_TASK_TABS: TaskTabItem[] = [
  { id: 'team-tasks', label: t('All tasks') },
];

export const TASK_TABS = [...PERSONAL_TASK_TABS, ...TEAM_TASK_TABS];

export const TASK_DEFAULT_GROUP_BY: Record<TaskTab, TaskGroupBy> = {
  'my-tasks': 'priority',
  'created-by-me': 'status',
  'team-tasks': 'priority',
};

export const TASK_GROUP_OPTIONS: {
  id: TaskGroupBy;
  label: string;
}[] = [
  { id: 'none', label: t('None') },
  { id: 'status', label: t('Status') },
  { id: 'priority', label: t('Priority') },
  { id: 'assignee', label: t('Assignee') },
  { id: 'project', label: t('Project') },
  { id: 'date', label: t('Date') },
];

export const TASK_SORT_DEFINITIONS: SortDefinition<
  TaskEntityWithProperties,
  TaskSortId
>[] = [
  {
    id: 'updated_at',
    compare: (left, right) =>
      compareDateDesc(
        left.sortTs ?? left.updatedAt,
        right.sortTs ?? right.updatedAt
      ),
  },
  {
    id: 'created_at',
    compare: (left, right) =>
      compareDateDesc(
        left.sortTs ?? left.createdAt,
        right.sortTs ?? right.createdAt
      ),
  },
  {
    id: 'viewed_at',
    compare: (left, right) =>
      compareDateDesc(
        left.sortTs ?? left.viewedAt,
        right.sortTs ?? right.viewedAt
      ),
  },
];

export const TASK_SORT_OPTIONS: {
  id: TaskSortId;
  label: string;
}[] = [
  { id: 'viewed_at', label: t('Viewed') },
  { id: 'updated_at', label: t('Updated') },
  { id: 'created_at', label: t('Created') },
];
