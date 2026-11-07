import CircleNotch from '@phosphor/circle-notch.svg';
import TranslateIcon from '@phosphor/translate.svg';
import { Button, cn, Tooltip } from '@ui';
import { createEffect, Show } from 'solid-js';
import { resolveTranslationButtonLabel } from './EmailTranslateButton';
import { emailTranslationEnabled } from './emailTranslationState';
import type { TranslatableMessage } from './translateMessage';
import {
  getThreadTranslationButtonState,
  prefetchSavedThreadTranslation,
  toggleThreadTranslation,
} from './translateThread';
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

  const msgs = () => props.messages ?? [];
  const hasMessages = () => msgs().length > 0 || Boolean(props.title);

  createEffect(() => {
    if (isAvailable() && props.threadId) {
      prefetchSavedThreadTranslation(props.threadId, msgs(), props.title);
    }
  });

  const buttonState = () =>
    getThreadTranslationButtonState(props.threadId, msgs(), props.title);

  const isLoading = () => buttonState() === 'loading';
  const isActive = () => buttonState() === 'show_original';
  const isRetry = () => buttonState() === 'retry';

  const label = () => resolveTranslationButtonLabel(buttonState());

  const handleClick = () => {
    if (!props.threadId || isLoading()) return;
    void toggleThreadTranslation(props.threadId, msgs(), props.title);
  };

  return (
    <Show when={isAvailable() && props.threadId}>
      <Tooltip
        shortcut={
          props.threadId && hasMessages() && !isLoading() ? 'q' : undefined
        }
        label={label()}
      >
        <Button
          variant="secondary"
          size="sm"
          disabled={!hasMessages() || isLoading()}
          onClick={handleClick}
          data-translation-state={buttonState()}
          class={cn(
            'bg-surface transition-colors shrink-0',
            isActive() && 'text-accent border-accent/40',
            isRetry() && 'text-danger border-danger/40',
            props.class
          )}
          aria-label={label()}
        >
          <Show
            when={isLoading()}
            fallback={
              <TranslateIcon
                class={cn(
                  'size-3.5',
                  isActive()
                    ? 'text-accent'
                    : isRetry()
                      ? 'text-danger'
                      : 'text-ink-muted'
                )}
              />
            }
          >
            <CircleNotch class="size-3.5 animate-spin text-ink-placeholder" />
          </Show>
          <Show when={!props.hideLabel}>
            <span>{label()}</span>
          </Show>
        </Button>
      </Tooltip>
    </Show>
  );
}
