import { t } from '@macro/i18n';
import CircleNotch from '@phosphor/circle-notch.svg';
import TranslateIcon from '@phosphor/translate.svg';
import { Button, cn } from '@ui';
import { Show } from 'solid-js';
import {
  clearThreadTranslation,
  emailTranslationEnabled,
  getThreadTranslationStatus,
} from './emailTranslationState';
import type { TranslatableMessage } from './translateMessage';
import { translateThread } from './translateThread';
import { isTranslationSupported } from './translatorClient';

export interface EmailThreadTranslateButtonProps {
  threadId?: string;
  title?: string;
  messages?: TranslatableMessage[];
  hideLabel?: boolean;
  class?: string;
}

export function EmailThreadTranslateButton(
  props: EmailThreadTranslateButtonProps
) {
  const isAvailable = () =>
    emailTranslationEnabled() && isTranslationSupported();

  const status = () =>
    props.threadId ? getThreadTranslationStatus(props.threadId) : 'idle';

  const isPartial = () => status() === 'partial';
  const isTranslated = () => status() === 'translated' || isPartial();
  const isTranslating = () => status() === 'loading';

  const msgs = () => props.messages ?? [];
  const hasMessages = () => msgs().length > 0;

  const handleClick = async () => {
    if (!props.threadId || isTranslating()) return;
    const currentStatus = status();
    const currentMsgs = msgs();
    const ids = currentMsgs
      .map((m) => m.db_id)
      .filter((id): id is string => Boolean(id));

    if (currentStatus === 'translated') {
      clearThreadTranslation(props.threadId, ids);
    } else {
      await translateThread(props.threadId, currentMsgs, props.title);
    }
  };

  const label = () =>
    isPartial()
      ? t('Partial translation failed. Original text was kept.')
      : isTranslated()
        ? t('Show original')
        : t('Translate');

  return (
    <Show when={isAvailable() && props.threadId}>
      <Button
        variant="outline"
        size="sm"
        depth={2}
        disabled={!hasMessages() || isTranslating()}
        label={label()}
        onClick={handleClick}
        class={cn(
          'bg-surface transition-colors shrink-0',
          isTranslated() && 'text-accent border-accent/40',
          props.class
        )}
        aria-label={label()}
      >
        <Show
          when={isTranslating()}
          fallback={
            <TranslateIcon
              class={cn(
                'size-3.5',
                isTranslated() ? 'text-accent' : 'text-ink-muted'
              )}
            />
          }
        >
          <CircleNotch class="size-3.5 animate-spin text-ink-placeholder" />
        </Show>
        <Show when={!props.hideLabel}>
          <span>
            {isPartial()
              ? t('Partial')
              : isTranslated()
                ? t('Original')
                : t('Translate')}
          </span>
        </Show>
      </Button>
    </Show>
  );
}
