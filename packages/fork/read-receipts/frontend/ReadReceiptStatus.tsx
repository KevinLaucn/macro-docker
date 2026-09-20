import CheckIcon from '@phosphor-icons/core/bold/check-bold.svg?component-solid';
import ChecksIcon from '@phosphor-icons/core/bold/checks-bold.svg?component-solid';
import { cn, Tooltip } from '@ui';
import { createMemo, Show } from 'solid-js';
import { useEmail } from '@core/context/user';
import { useEmailLinksQuery } from '@queries/email/link';
import {
  useReadReceiptStatusQuery,
  useThreadReadReceiptStatusQuery,
} from './queries';
import { formatReadReceiptStatus } from './utils';

export interface ReadReceiptStatusProps {
  message: {
    db_id?: string | null;
    is_sent?: boolean | null;
    is_draft?: boolean | null;
    sent_at?: string | null;
    from?: { email?: string | null } | null;
  };
  class?: string;
  showIconOnly?: boolean;
}

export function ReadReceiptStatus(props: ReadReceiptStatusProps) {
  const viewerEmail = useEmail();
  const accounts = useEmailLinksQuery();

  const isSent = () => {
    if (props.message.is_sent != null) return Boolean(props.message.is_sent);
    const fromEmail = props.message.from?.email?.toLowerCase();
    if (!fromEmail) return false;
    if (viewerEmail()?.toLowerCase() === fromEmail) return true;
    const links = accounts.isSuccess ? accounts.data?.links : undefined;
    return Boolean(
      links?.some(
        (acc) => acc.email_address?.toLowerCase() === fromEmail
      )
    );
  };

  const isEligible = () => {
    return Boolean(isSent() && !props.message.is_draft && props.message.db_id);
  };

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

  const isOpened = () =>
    Boolean(query.isSuccess && query.data?.is_opened);

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
