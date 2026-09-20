import { awaitingReplyTagId } from '@app/features/extensions/extensionsState';
import { TagDot } from '@app/features/property/tags/TagDot';
import { tagPillClasses } from '@app/features/property/tags/TagPill';
import type { EmailEntity } from '@entity';
import { useTagsQuery } from '@queries/properties/tags';
import { cn } from '@ui';
import { createMemo, type JSX, Show } from 'solid-js';

export interface AwaitingReplyTagProps {
  entity: EmailEntity;
  onFilterByTag?: (optionId: string) => void;
  class?: string;
}

/**
 * Checks if the configured tag in "Extensions" settings exists in the user's tag library.
 * Returns its metadata (id, label, color) if found, or undefined if not enabled or not found.
 */
export function useAwaitingReplyTagOption() {
  const tagsQuery = useTagsQuery();

  return createMemo(() => {
    const targetId = awaitingReplyTagId();
    if (!targetId) return undefined;

    const sets = Array.isArray(tagsQuery.data) ? tagsQuery.data : [];
    for (const set of sets) {
      if (!Array.isArray(set.options)) continue;
      for (const opt of set.options) {
        if (opt.id === targetId) {
          const label =
            opt.value?.type === 'string'
              ? opt.value.value
              : ((opt as any).name ?? targetId);
          return {
            id: opt.id,
            label,
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
  if (entity.done || entity.isDraft) {
    return false;
  }

  const anyEntity = entity as any;
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
 * Awaiting Reply Tag Badge
 * Dynamically displays the configured tag matching user's Extensions settings.
 * If the tag is NOT configured in settings, it renders nothing.
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
        <TagDot color={tagOption()?.color ?? undefined} class="size-2" />
        <span class="min-w-0 truncate">{tagOption()?.label}</span>
      </span>
    </Show>
  );
}
