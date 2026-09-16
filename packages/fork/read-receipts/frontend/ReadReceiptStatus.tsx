import CheckIcon from '@phosphor-icons/core/regular/check.svg?component-solid';
import ChecksIcon from '@phosphor-icons/core/regular/checks.svg?component-solid';
import { cn, Tooltip } from '@ui';
import { createMemo, Show } from 'solid-js';
import { useReadReceiptStatusQuery } from './queries';
import { formatReadReceiptStatus } from './utils';

export interface ReadReceiptStatusProps {
  message: {
    db_id?: string | null;
    is_sent?: boolean | null;
    is_draft?: boolean | null;
    sent_at?: string | null;
  };
  class?: string;
  showIconOnly?: boolean;
}

export function ReadReceiptStatus(props: ReadReceiptStatusProps) {
  const isEligible = () => {
    const isSent = Boolean(props.message.is_sent);
    return Boolean(isSent && !props.message.is_draft && props.message.db_id);
  };

  const query = useReadReceiptStatusQuery(
    () => props.message.db_id,
    isEligible
  );

  const formatted = createMemo(() => formatReadReceiptStatus(query.data));
  const isOpened = () => (query.data?.open_count ?? 0) > 0;

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
            fallback={<CheckIcon class="size-3.5" />}
          >
            <ChecksIcon class="size-3.5" />
          </Show>
          <Show when={!props.showIconOnly}>
            <span>{formatted().label}</span>
          </Show>
        </span>
      </Tooltip>
    </Show>
  );
}
