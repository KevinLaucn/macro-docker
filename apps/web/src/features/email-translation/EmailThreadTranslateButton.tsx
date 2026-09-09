import { t } from '@macro/i18n';
import CircleNotch from '@phosphor/circle-notch.svg';
import TranslateIcon from '@phosphor/translate.svg';
import type { ApiMessage } from '@service-email/generated/schemas';
import { Button, cn } from '@ui';
import { Show } from 'solid-js';
import {
  clearThreadTranslation,
  emailTranslationEnabled,
  getThreadTranslationStatus,
} from './emailTranslationState';
import { translateThread } from './translateThread';
import { isTranslationSupported } from './translatorClient';

export interface EmailThreadTranslateButtonProps {
  threadId?: string;
  messages?: ApiMessage[];
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

  const isTranslated = () => status() === 'translated';
  const isTranslating = () => status() === 'loading';

  const msgs = () => props.messages ?? [];
  const hasMessages = () => msgs().length > 0;

  const handleClick = async () => {
    if (!props.threadId || isTranslating()) return;
    const currentStatus = status();
    const currentMsgs = msgs();
    const ids = currentMsgs.map((m) => m.db_id).filter(Boolean);

    if (currentStatus === 'translated') {
      clearThreadTranslation(props.threadId, ids);
    } else {
      await translateThread(props.threadId, currentMsgs);
    }
  };

  const label = () => (isTranslated() ? t('Show original') : t('Translate'));

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
          <span>{isTranslated() ? t('Original') : t('Translate')}</span>
        </Show>
      </Button>
    </Show>
  );
}
