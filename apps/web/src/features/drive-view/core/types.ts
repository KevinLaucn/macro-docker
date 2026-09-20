import { t } from '@macro/i18n';

export type DriveTab = 'owned' | 'recent' | 'shared';
export type DriveScope = 'default' | 'all' | 'attachments';
export type DriveSort = 'updated_at' | 'created_at' | 'viewed_at';

export type DriveLocation =
  | { kind: 'tab'; tab: DriveTab }
  | { kind: 'folder'; id: string | null };

export type DriveFolder = {
  id: string;
  name: string;
  parentId?: string | null;
};

export type DriveFolderNode = DriveFolder & { children: DriveFolderNode[] };

export type DriveState = {
  location: DriveLocation;
  scope: DriveScope;
  sort: DriveSort;
  expandedFolderIds: string[];
  favoritesOpen: boolean;
  rootOpen: boolean;
  tagsOpen: boolean;
};

export const DRIVE_TABS = [
  { id: 'owned' as const, label: t('My Files') },
  { id: 'recent' as const, label: t('Recent') },
  { id: 'shared' as const, label: t('Shared with me') },
] satisfies { id: DriveTab; label: string }[];
