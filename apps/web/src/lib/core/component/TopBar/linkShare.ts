import type { ItemType } from '@service-storage/client';
import type { AccessLevel } from '@service-storage/generated/schemas/accessLevel';
import type { LinkShare } from '@service-storage/generated/schemas/linkShare';
import type { UpdateSharePermissionRequestV2 } from '@service-storage/generated/schemas/updateSharePermissionRequestV2';
import { match } from 'ts-pattern';

export const NO_LINK_SHARE = 'NONE' as const;

export type ShareItemType =
  | ItemType
  | 'initiative'
  | 'crm_pipeline'
  | 'external_chat';

const TEAM_SHAREABLE_ITEM_TYPES: ReadonlySet<ShareItemType> =
  new Set<ShareItemType>([
    'document',
    'chat',
    'call',
    'project',
    'agent_session',
    'initiative',
    'crm_pipeline',
    'database',
    'external_chat',
  ]);

export function isTeamShareSupportedForItem(itemType: ShareItemType): boolean {
  return TEAM_SHAREABLE_ITEM_TYPES.has(itemType);
}

/**
 * Human noun for copy such as "Share this chat with the owner's team." or a
 * mention card's "You don't have access to this event".
 */
export function getShareItemNoun(itemType: ShareItemType): string {
  return match(itemType)
    .with('email', () => 'email thread')
    .with('agent_session', () => 'agent session')
    .with('project', () => 'folder')
    .with('initiative', () => 'project')
    .with('crm_pipeline', () => 'pipeline')
    .with('crm_company', () => 'company')
    .with('crm_contact', () => 'contact')
    .with('calendar_event', () => 'event')
    .with('channel_message', () => 'message')
    .with('channel_thread', () => 'thread')
    .with('foreign', () => 'item')
    .with('external_chat', () => 'chat')
    .with(
      'document',
      'chat',
      'channel',
      'call',
      'database',
      'form',
      'routine',
      (noun) => noun
    )
    .exhaustive();
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

import { t } from '@macro/i18n';

const LINK_SHARE_SCOPE_COPY: Record<LinkShareScope, LinkShareScopeCopy> = {
  NONE: {
    get label() {
      return t('Only people with access');
    },
    get title() {
      return t('Only people with access');
    },
    get description() {
      return t('The link only works for people who already have access.');
    },
  },
  PUBLIC: {
    get label() {
      return t('Anyone with the link');
    },
    get title() {
      return t('Anyone with the link');
    },
    get description() {
      return t('Anyone with the link can access this item.');
    },
  },
  TEAM: {
    get label() {
      return t('Team members with the link');
    },
    get title() {
      return t('Team members with the link');
    },
    get description() {
      return t(
        "Members of the owner's team can open this link. Others need to be added separately."
      );
    },
  },
};

const TEAM_SHARE_COPY: Record<TeamShareScope, string> = {
  get NONE() {
    return t('No team access');
  },
  get view() {
    return t('Can view');
  },
  get comment() {
    return t('Can comment');
  },
  get edit() {
    return t('Can edit');
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

export function teamShareScopeOptionsForItem(itemType: ShareItemType) {
  if (itemType === 'crm_pipeline')
    return TEAM_SHARE_SCOPE_OPTIONS.filter(
      (option) => option.value === 'NONE' || option.value === 'edit'
    );
  return itemType === 'call' || itemType === 'external_chat'
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
  hasExplicitShares: boolean,
  teamShareAccessLevel?: AccessLevel | null
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

  if (getTeamShareScope(teamShareAccessLevel) !== 'NONE') {
    return { label: 'Team', tooltip: "Shared directly with the owner's team." };
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
