import CheckIcon from '@phosphor-icons/core/bold/check-bold.svg?component-solid';
import ChecksIcon from '@phosphor-icons/core/bold/checks-bold.svg?component-solid';
import { cn, Tooltip } from '@ui';
import { createMemo, Show } from 'solid-js';
import {
  useReadReceiptStatusQuery,
  useThreadReadReceiptStatusQuery,
} from './queries';
import {
  formatReadReceiptStatus,
  isConfirmedSentMessage,
  type SentMessageCandidate,
} from './utils';

export interface ReadReceiptStatusProps {
  message: SentMessageCandidate;
  class?: string;
  showIconOnly?: boolean;
}

export function ReadReceiptStatus(props: ReadReceiptStatusProps) {
  const isEligible = () => isConfirmedSentMessage(props.message);

  const query = useReadReceiptStatusQuery(
    () => props.message.db_id,
    isEligible
  );

  const formatted = createMemo(() =>
    formatReadReceiptStatus(query.isSuccess ? query.data : undefined)
  );
  const isOpened = () =>
    Boolean(query.isSuccess && (query.data?.open_count ?? 0) > 0);

  return (
    <Show when={isEligible()}>
      <Tooltip label={formatted().tooltip}>
        <span
          class={
            props.showIconOnly
              ? cn(
                  'size-6 flex items-center justify-center rounded-md hover:overlay-hover transition-colors text-xs cursor-default shrink-0',
                  isOpened() ? 'text-orange' : 'text-ink-extra-muted',
                  props.class
                )
              : cn(
                  'flex items-center gap-1 text-xs cursor-default shrink-0',
                  isOpened() ? 'text-orange' : 'text-ink-extra-muted',
                  props.class
                )
          }
        >
          <Show
            when={isOpened()}
            fallback={
              <CheckIcon class="size-3.5 stroke-current [stroke-width:12px]" />
            }
          >
            <ChecksIcon class="size-4 stroke-current [stroke-width:12px]" />
          </Show>
          <Show when={!props.showIconOnly}>
            <span>{formatted().label}</span>
          </Show>
        </span>
      </Tooltip>
    </Show>
  );
}

export interface ThreadReadReceiptStatusProps {
  threadId: string;
  class?: string;
  showIconOnly?: boolean;
}

export function ThreadReadReceiptStatus(props: ThreadReadReceiptStatusProps) {
  const query = useThreadReadReceiptStatusQuery(
    () => props.threadId,
    () => Boolean(props.threadId)
  );

  const isOpened = () => Boolean(query.isSuccess && query.data?.is_opened);

  const formatted = createMemo(() => {
    const data = query.isSuccess ? query.data : undefined;
    return formatReadReceiptStatus(data);
  });

  return (
    <Show when={Boolean(query.isSuccess && query.data?.latest_sent_message_id)}>
      <Tooltip label={formatted().tooltip}>
        <span
          class={cn(
            'inline-flex items-center justify-center text-xs cursor-default shrink-0',
            isOpened() ? 'text-orange' : 'text-ink-extra-muted',
            props.class
          )}
        >
          <Show
            when={isOpened()}
            fallback={
              <CheckIcon class="size-3.5 stroke-current [stroke-width:12px]" />
            }
          >
            <ChecksIcon class="size-3.5 stroke-current [stroke-width:12px]" />
          </Show>
          <Show when={!props.showIconOnly}>
            <span class="ml-1">{formatted().label}</span>
          </Show>
        </span>
      </Tooltip>
    </Show>
  );
}
