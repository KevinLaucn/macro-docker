import { HoverCard } from '@core/component/HoverCard';
import { StaticMarkdown } from '@core/component/LexicalMarkdown/component/core/StaticMarkdown';
import { unifiedListMarkdownTheme } from '@core/component/LexicalMarkdown/theme';
import { toast } from '@core/component/Toast/Toast';
import { UserIcon } from '@core/component/UserIcon';
import { UserTooltip } from '@core/component/UserTooltip';
import { useEmailLinksContext } from '@core/context/emailLinks';
import { emailToMacroId, getDisplayName } from '@core/user';
import {
  EmailParticipantIdentity,
  normalizeEmail,
  resolveParticipantIdentities,
  resolveSelfEmails,
} from '@macro/email-participant-identity';
import {
  highlightTermsInText,
  mergeAdjacentMacroEmTags,
} from '@core/util/searchHighlight';
import WideCopy from '@icon/wide-copy.svg';
import { Surface } from '@ui';
import { createSignal, For, Show } from 'solid-js';
import type { EmailEntity, EmailThreadParticipants } from '../types/entity';
import { isSearchEntity } from '../types/search';

/** Checks if a value is likely an email address */
function isLikelyEmail(value?: string): boolean {
  return typeof value === 'string' && value.includes('@');
}

/** Extracts the local part of an email address (before @) */
function getEmailLocalPart(email: string): string {
  return email.split('@')[0];
}

/**
 * Resolves the best display name for a participant
 * Priority: macroDisplayName > participant.name > email local part
 */
function resolveParticipantName(
  participant: EmailThreadParticipants[number],
  macroDisplayName?: string
): string {
  if (macroDisplayName && !isLikelyEmail(macroDisplayName)) {
    return macroDisplayName;
  }
  const participantFullName = participant.name ?? '';
  if (participantFullName && !isLikelyEmail(participantFullName)) {
    return participantFullName;
  }
  return getEmailLocalPart(participant.email);
}

type ResolvedParticipant = {
  participant: EmailThreadParticipants[number];
  displayName: string;
};

function ParticipantWithTooltip(props: {
  participant: EmailThreadParticipants[number];
  displayName: string;
  highlighted?: string;
  selfEmailSet: ReadonlySet<string>;
}) {
  const macroId = () => emailToMacroId(props.participant.email);
  const macroDisplayName = () => getDisplayName(macroId());
  const tooltipName = () =>
    resolveParticipantName(props.participant, macroDisplayName());
  const [open, setOpen] = createSignal(false);

  return (
    <HoverCard
      open={open()}
      onOpenChange={setOpen}
      triggerAs="span"
      trigger={
        <>
          <Show when={props.highlighted}>
            {(md) => (
              <StaticMarkdown
                markdown={md()}
                theme={unifiedListMarkdownTheme}
                singleLine
              />
            )}
          </Show>
          <Show when={!props.highlighted}>
            <EmailParticipantIdentity
              participant={props.participant}
              selfEmailSet={props.selfEmailSet}
              label={props.displayName}
              avatar={
                <UserIcon
                  email={props.participant.email}
                  photoUrl={props.participant.photoUrl}
                  size="sm"
                  suppressClick
                  showTooltip={false}
                />
              }
            />
          </Show>
        </>
      }
      content={
        <UserTooltip
          displayName={tooltipName()}
          email={props.participant.email}
          id={macroId()}
          onClose={() => setOpen(false)}
        />
      }
    />
  );
}

/**
 * Resolves participants into display-ready objects, handling the "me" case
 * and filtering out the current user.
 */
function resolveParticipants(
  participants: EmailThreadParticipants | undefined,
  selfEmailSet: ReadonlySet<string>,
  getMacroDisplayName: (email: string) => string | undefined
): ResolvedParticipant[] {
  if (!participants || participants.length === 0) return [];

  return resolveParticipantIdentities(participants, selfEmailSet).map(
    (identity) => {
      const participant = participants.find(
        (p) => normalizeEmail(p.email) === normalizeEmail(identity.email)
      ) ?? {
        email: identity.email,
      };
      return {
        participant,
        displayName: identity.isSelf
          ? 'me'
          : resolveParticipantName(
              participant,
              getMacroDisplayName(identity.email)
            ),
      };
    }
  );
}

function abbreviateParticipants(
  resolved: ResolvedParticipant[]
): ResolvedParticipant[] {
  if (resolved.length <= 1) return resolved;

  const abbreviated = resolved.map((r) => ({
    ...r,
    displayName: r.displayName.split(' ')[0],
  }));

  if (abbreviated.length <= 3) return abbreviated;

  return [abbreviated[0], abbreviated[1]];
}

function copyEmail(email: string, e: MouseEvent) {
  e.stopPropagation();
  navigator.clipboard.writeText(email);
  toast.success('Email copied');
}

function HiddenParticipantsTooltip(props: { hidden: ResolvedParticipant[] }) {
  return (
    <HoverCard
      triggerAs="span"
      trigger={<span class="opacity-60">+{props.hidden.length}</span>}
      content={
        <Surface depth={3} class="py-1 text-ink">
          <For each={props.hidden}>
            {(r) => (
              <div
                class="flex items-center gap-2 px-2 py-1 text-xs hover:bg-hover"
                onClick={[copyEmail, r.participant.email]}
              >
                <span class="truncate">{r.participant.email}</span>
                <WideCopy class="size-3 shrink-0 opacity-60" />
              </div>
            )}
          </For>
        </Surface>
      }
    />
  );
}

/** Get a nicely formatted list of participants from an email entity. */
export function EntityEmailParticipants(props: { entity: EmailEntity }) {
  // PRIVATE-HOOK: email_identity:participants
  const { links } = useEmailLinksContext();
  const selfEmailSet = () => resolveSelfEmails(links());
  const fetchDisplayName = (email: string) =>
    getDisplayName(emailToMacroId(email));

  const participants = () =>
    abbreviateParticipants(
      resolveParticipants(
        props.entity.participants,
        selfEmailSet(),
        fetchDisplayName
      )
    );

  const allResolved = () =>
    resolveParticipants(
      props.entity.participants,
      selfEmailSet(),
      fetchDisplayName
    );

  const hiddenParticipants = () => {
    const all = allResolved();
    return all.length > 3 ? all.slice(2) : [];
  };

  const searchTerms = () => {
    if (!isSearchEntity(props.entity)) return undefined;
    return props.entity.search.senderHighlightTerms;
  };

  const highlightName = (name: string) => {
    const terms = searchTerms();
    if (!terms?.length) return undefined;
    const result = mergeAdjacentMacroEmTags(highlightTermsInText(name, terms));
    return result !== name ? result : undefined;
  };

  return (
    <>
      <For each={participants()}>
        {(resolved, index) => (
          <>
            <Show when={index() > 0}>, </Show>
            <ParticipantWithTooltip
              participant={resolved.participant}
              displayName={resolved.displayName}
              highlighted={highlightName(resolved.displayName)}
              selfEmailSet={selfEmailSet()}
            />
          </>
        )}
      </For>
      <Show when={hiddenParticipants().length > 0}>
        {''}
        <HiddenParticipantsTooltip hidden={hiddenParticipants()} />
      </Show>
    </>
  );
}
