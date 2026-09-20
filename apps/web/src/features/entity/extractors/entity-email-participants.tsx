import { HoverCard } from '@core/component/HoverCard';
import { StaticMarkdown } from '@core/component/LexicalMarkdown/component/core/StaticMarkdown';
import { unifiedListMarkdownTheme } from '@core/component/LexicalMarkdown/theme';
import { toast } from '@core/component/Toast/Toast';
import { UserIcon } from '@core/component/UserIcon';
import { UserTooltip } from '@core/component/UserTooltip';
import { useEmailLinksContext } from '@core/context/emailLinks';
import { emailToMacroId, getDisplayName } from '@core/user';
import {
  highlightTermsInText,
  mergeAdjacentMacroEmTags,
} from '@core/util/searchHighlight';
import {
  buildThreadDisplay,
  EmailParticipantIdentity,
  normalizeEmail,
  resolveParticipantIdentities,
  resolveSelfEmails,
} from '@macro/email-participant-identity';
import CopyIcon from '@phosphor/copy.svg';
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
  isSelf: boolean;
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
                <Show
                  when={(props.participant as { photoUrl?: string }).photoUrl}
                >
                  {(url) => (
                    <UserIcon
                      email={props.participant.email}
                      photoUrl={url()}
                      size="sm"
                      suppressClick
                      showTooltip={false}
                      class="shrink-0 size-3.5 rounded-full inline-block"
                    />
                  )}
                </Show>
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
          photoUrl={(props.participant as { photoUrl?: string }).photoUrl}
          onClose={() => setOpen(false)}
        />
      }
    />
  );
}

/**
 * Resolves participants into display-ready objects while preserving the fork's
 * logical self identity. External display names continue using Macro's normal
 * name resolution; self must remain the stable `me` label.
 */
export function resolveParticipants(
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
      const photoUrl =
        (participant as { photoUrl?: string }).photoUrl ??
        identity.photoUrl ??
        undefined;
      return {
        participant: { ...participant, photoUrl },
        displayName: identity.isSelf
          ? identity.label
          : resolveParticipantName(
              participant,
              getMacroDisplayName(identity.email)
            ),
        isSelf: identity.isSelf,
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
                <CopyIcon class="size-3 shrink-0 opacity-60" />
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
  const { links } = useEmailLinksContext();
  const selfEmailSet = () => resolveSelfEmails(links());
  const fetchDisplayName = (email: string) =>
    getDisplayName(emailToMacroId(email));

  const viewMode = () => {
    const rawMode = (props.entity as { emailIdentityViewMode?: string })
      .emailIdentityViewMode;
    return rawMode === 'sent' ? 'sent' : 'inbox';
  };

  const latestSender = () => {
    if (!props.entity.senderEmail) return undefined;
    return {
      email: props.entity.senderEmail,
      name: props.entity.senderName,
      photoUrl:
        (props.entity as { senderPhotoUrl?: string }).senderPhotoUrl ??
        undefined,
    };
  };

  // PRIVATE-HOOK: email_identity:participants
  const display = () =>
    buildThreadDisplay({
      participants: props.entity.participants ?? [],
      latestSender: latestSender(),
      selfEmailSet: selfEmailSet(),
      viewMode: viewMode(),
    });

  const orderedResolved = () => {
    const thread = display();
    const allParticipants = props.entity.participants ?? [];
    return thread.participants.map((identity) => {
      const original = allParticipants.find(
        (p) => normalizeEmail(p.email) === normalizeEmail(identity.email)
      ) ?? { email: identity.email, name: identity.label };
      const photoUrl =
        (original as { photoUrl?: string }).photoUrl ??
        identity.photoUrl ??
        (normalizeEmail(identity.email) ===
        normalizeEmail(props.entity.senderEmail ?? '')
          ? (props.entity as { senderPhotoUrl?: string }).senderPhotoUrl ??
            undefined
          : undefined);
      return {
        participant: {
          ...original,
          photoUrl,
        },
        displayName: identity.isSelf
          ? identity.label
          : resolveParticipantName(original, fetchDisplayName(identity.email)),
        isSelf: identity.isSelf,
      };
    });
  };

  const participants = () => abbreviateParticipants(orderedResolved());

  const allResolved = () => orderedResolved();

  const hiddenParticipants = () => {
    const all = allResolved();
    return all.length > 3 ? all.slice(2) : [];
  };

  const searchTerms = () => {
    if (!isSearchEntity(props.entity)) return undefined;
    return props.entity.search.senderHighlightTerms;
  };

  const highlightName = (name: string, isSelf: boolean) => {
    if (isSelf) return undefined;
    const terms = searchTerms();
    if (!terms?.length) return undefined;
    const result = mergeAdjacentMacroEmTags(highlightTermsInText(name, terms));
    return result !== name ? result : undefined;
  };

  const isOutbound = () => {
    const sender = latestSender();
    return sender ? selfEmailSet().has(normalizeEmail(sender.email)) : false;
  };

  const renderSeparator = (index: number, isSelf: boolean) => {
    if (index === 0) return null;
    if (display().separator === 'arrow') {
      const isArrow = isOutbound() ? index === 1 : isSelf;
      if (isArrow) {
        return <span class="opacity-60 mx-1">→</span>;
      }
    }
    return <>, </>;
  };

  return (
    <>
      <For each={participants()}>
        {(resolved, index) => (
          <>
            {renderSeparator(index(), resolved.isSelf)}
            <ParticipantWithTooltip
              participant={resolved.participant}
              displayName={resolved.displayName}
              highlighted={highlightName(resolved.displayName, resolved.isSelf)}
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
