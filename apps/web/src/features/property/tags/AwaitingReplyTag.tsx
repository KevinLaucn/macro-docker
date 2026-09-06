import type { EmailEntity } from '@features/entity/types/entity';
import { useTagsQuery } from '@queries/properties/tags';
import { cn } from '@ui';
import { createMemo, type JSX, Show } from 'solid-js';
import { TagDot } from './TagDot';
import { tagPillClasses } from './TagPill';

export interface AwaitingReplyTagProps {
  entity: EmailEntity;
  onFilterByTag?: (optionId: string) => void;
  class?: string;
}

/**
 * Checks if the user's tag library in Settings contains a tag named "待回复".
 * Returns its metadata (id, label, color) if found, or undefined if not configured.
 */
export function useAwaitingReplyTagOption() {
  const tagsQuery = useTagsQuery();

  return createMemo(() => {
    const sets = Array.isArray(tagsQuery.data) ? tagsQuery.data : [];
    for (const set of sets) {
      if (!Array.isArray(set.options)) continue;
      for (const opt of set.options) {
        if (opt.value?.type === 'string' && opt.value.value === '待回复') {
          return {
            id: opt.id,
            label: opt.value.value,
            color: opt.color,
          };
        }
      }
    }
    return undefined;
  });
}

/**
 * Evaluates whether an email thread is in "awaiting reply" status.
 */
function isThreadAwaitingReply(entity: EmailEntity): boolean {
  // If thread is already done (archived) or is a draft, it is not awaiting reply
  if (entity.done || entity.isDraft) {
    return false;
  }

  const anyEntity = entity as any;

  // 1. Explicit inbound and outbound timestamps comparison
  const inbound =
    anyEntity.latestInboundMessageTs ?? anyEntity.latest_inbound_message_ts;
  const outbound =
    anyEntity.latestOutboundMessageTs ?? anyEntity.latest_outbound_message_ts;

  if (inbound && outbound) {
    return new Date(inbound).getTime() > new Date(outbound).getTime();
  }
  if (inbound && !outbound) {
    return true;
  }

  // 2. Fallback check on email labels:
  // An active inbox email (!done) without a SENT label is an unreplied incoming thread
  const hasSentLabel = entity.labels?.some(
    (label) =>
      label.name === 'SENT' || (label as any).provider_label_id === 'SENT'
  );

  return !hasSentLabel;
}

/**
 * Checks whether the entity already has this tag in its physical properties
 * to prevent duplicate badge rendering.
 */
function hasPhysicalTag(entity: EmailEntity, optionId: string): boolean {
  if (!entity.properties?.length) return false;
  return entity.properties.some((prop) => {
    const val = prop.value;
    if (
      val &&
      typeof val === 'object' &&
      'type' in val &&
      val.type === 'SelectOption'
    ) {
      const optionIds = (val as any).value;
      return Array.isArray(optionIds) && optionIds.includes(optionId);
    }
    return false;
  });
}

/**
 * [FORK-FEATURE]: Awaiting Reply Tag Badge
 * Dynamically displays the "待回复" tag matching user's backend Settings configuration.
 * If the tag is NOT configured in the user's settings, it renders nothing (silently ignored).
 */
export function AwaitingReplyTag(props: AwaitingReplyTagProps): JSX.Element {
  const tagOption = useAwaitingReplyTagOption();

  const isVisible = createMemo(() => {
    const option = tagOption();
    if (!option) return false;
    if (hasPhysicalTag(props.entity, option.id)) return false;
    return isThreadAwaitingReply(props.entity);
  });

  return (
    <Show when={isVisible()}>
      <span
        class={cn(
          tagPillClasses('max-w-[14ch] shrink-0 select-none'),
          props.class
        )}
        title="待回复"
        onClick={(e) => {
          e.stopPropagation();
          const opt = tagOption();
          if (props.onFilterByTag && opt?.id) {
            props.onFilterByTag(opt.id);
          }
        }}
      >
        <TagDot color={tagOption()?.color} class="size-2" />
        <span class="min-w-0 truncate">{tagOption()?.label}</span>
      </span>
    </Show>
  );
}
