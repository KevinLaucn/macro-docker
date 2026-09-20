import type { ItemType } from '@service-storage/client';
import type { AccessLevel } from '@service-storage/generated/schemas/accessLevel';
import type { LinkShare } from '@service-storage/generated/schemas/linkShare';
import type { UpdateSharePermissionRequestV2 } from '@service-storage/generated/schemas/updateSharePermissionRequestV2';

export const NO_LINK_SHARE = 'NONE' as const;

const TEAM_SHAREABLE_ITEM_TYPES: ReadonlySet<ItemType> = new Set<ItemType>([
  'document',
  'chat',
  'call',
  'project',
]);

export function isTeamShareSupportedForItem(itemType: ItemType): boolean {
  return TEAM_SHAREABLE_ITEM_TYPES.has(itemType);
}

/** Human noun for share-modal copy such as "Share this chat with the owner's team." */
export function getShareItemNoun(itemType: ItemType): string {
  switch (itemType) {
    case 'email':
      return 'email thread';
    case 'agent_session':
      return 'agent session';
    case 'project':
      return 'folder';
    default:
      return itemType;
  }
}

export type LinkShareScope = LinkShare | typeof NO_LINK_SHARE;

export type LinkSharePayload = Required<
  Pick<UpdateSharePermissionRequestV2, 'linkShare' | 'linkShareAccessLevel'>
>;

export const NO_TEAM_SHARE = 'NONE' as const;

export type TeamShareLevel = Exclude<AccessLevel, 'owner'>;

export type TeamShareScope = TeamShareLevel | typeof NO_TEAM_SHARE;

export type CallTeamShareScope = typeof NO_TEAM_SHARE | 'view';

export type TeamSharePayload = Required<
  Pick<UpdateSharePermissionRequestV2, 'teamShareAccessLevel'>
>;

type LinkShareScopeCopy = {
  label: string;
  title: string;
  description: string;
};

export type ShareStatus = {
  label: 'Public' | 'Team' | 'Shared' | 'Just me';
  tooltip: string;
};

import { t } from '@fork/i18n';

const LINK_SHARE_SCOPE_COPY: Record<LinkShareScope, LinkShareScopeCopy> = {
  NONE: {
    get label() {
      return t('None');
    },
    get title() {
      return t('Link sharing off');
    },
    get description() {
      return t(
        'Only people and channels you explicitly share with can access this item.'
      );
    },
  },
  PUBLIC: {
    get label() {
      return t('Public');
    },
    get title() {
      return t('Public link');
    },
    get description() {
      return t('Anyone with the link can access this item.');
    },
  },
  TEAM: {
    get label() {
      return t('Team');
    },
    get title() {
      return t('Team link');
    },
    get description() {
      return t(
        "Members of the owner's team with the link can access this item. This does not share it directly with a team or channel."
      );
    },
  },
};

const TEAM_SHARE_COPY: Record<TeamShareScope, string> = {
  get NONE() {
    return t('None');
  },
  get view() {
    return t('View');
  },
  get comment() {
    return t('Comment');
  },
  get edit() {
    return t('Edit');
  },
};

export const LINK_SHARE_SCOPE_OPTIONS = (
  ['NONE', 'PUBLIC', 'TEAM'] as const
).map((scope) => ({
  value: scope,
  get label() {
    return LINK_SHARE_SCOPE_COPY[scope].label;
  },
}));

export const TEAM_SHARE_SCOPE_OPTIONS = (
  ['NONE', 'view', 'comment', 'edit'] as const
).map((scope) => ({
  value: scope,
  get label() {
    return TEAM_SHARE_COPY[scope];
  },
}));

export const CALL_TEAM_SHARE_SCOPE_OPTIONS = (
  ['NONE', 'view'] as const satisfies readonly CallTeamShareScope[]
).map((scope) => ({
  value: scope,
  get label() {
    return TEAM_SHARE_COPY[scope];
  },
}));

export function teamShareScopeOptionsForItem(itemType: ItemType) {
  return itemType === 'call'
    ? CALL_TEAM_SHARE_SCOPE_OPTIONS
    : TEAM_SHARE_SCOPE_OPTIONS;
}

export function getLinkShareScope(
  linkShare: LinkShare | null | undefined
): LinkShareScope {
  return linkShare ?? NO_LINK_SHARE;
}

export function buildLinkSharePayload(
  scope: LinkShareScope,
  accessLevel?: AccessLevel | null
): LinkSharePayload {
  if (scope === NO_LINK_SHARE) {
    return {
      linkShare: null,
      linkShareAccessLevel: null,
    };
  }

  return {
    linkShare: scope,
    linkShareAccessLevel: accessLevel ?? 'view',
  };
}

export function buildLinkShareScopePayload(
  currentScope: LinkShareScope,
  nextScope: LinkShareScope,
  currentAccessLevel?: AccessLevel | null
): LinkSharePayload {
  const accessLevel =
    currentScope === NO_LINK_SHARE ? null : currentAccessLevel;
  return buildLinkSharePayload(nextScope, accessLevel);
}

export function getLinkShareScopeCopy(
  scope: LinkShareScope
): LinkShareScopeCopy {
  return LINK_SHARE_SCOPE_COPY[scope];
}

export function getTeamShareScope(
  teamShareAccessLevel: AccessLevel | null | undefined
): TeamShareScope {
  if (
    teamShareAccessLevel === 'view' ||
    teamShareAccessLevel === 'comment' ||
    teamShareAccessLevel === 'edit'
  ) {
    return teamShareAccessLevel;
  }
  return NO_TEAM_SHARE;
}

export function buildTeamSharePayload(scope: TeamShareScope): TeamSharePayload {
  return {
    teamShareAccessLevel: scope === NO_TEAM_SHARE ? null : scope,
  };
}

export function getTeamShareScopeCopy(scope: TeamShareScope): string {
  return TEAM_SHARE_COPY[scope];
}

export function getShareStatus(
  linkShare: LinkShare | null | undefined,
  hasExplicitShares: boolean
): ShareStatus {
  if (linkShare === 'PUBLIC') {
    return {
      label: 'Public',
      tooltip: LINK_SHARE_SCOPE_COPY.PUBLIC.description,
    };
  }

  if (linkShare === 'TEAM') {
    return {
      label: 'Team',
      tooltip: LINK_SHARE_SCOPE_COPY.TEAM.description,
    };
  }

  if (hasExplicitShares) {
    return {
      label: 'Shared',
      tooltip: 'Shared with specific people or channels.',
    };
  }

  return {
    label: 'Just me',
    tooltip: 'Only you can access this item.',
  };
}
