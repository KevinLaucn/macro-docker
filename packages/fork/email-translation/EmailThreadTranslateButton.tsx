import { t } from '@macro/i18n';
import TranslateIcon from '@phosphor/translate.svg';
import { Button, cn, Tooltip } from '@ui';
import { Show } from 'solid-js';
import type { TranslatableMessage } from './translateMessage';
import { requestBrowserTranslation } from './browserTranslation';

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
  const label = () => t('Translate with browser');

  return (
    <Show when={props.threadId}>
      <Tooltip label={label()}>
        <Button
          variant="outline"
          size="sm"
          depth={2}
          onClick={requestBrowserTranslation}
          class={cn('bg-surface transition-colors shrink-0', props.class)}
          aria-label={label()}
        >
          <TranslateIcon class="size-3.5 text-ink-muted" />
          <Show when={!props.hideLabel}>
            <span>{t('Translate')}</span>
          </Show>
        </Button>
      </Tooltip>
    </Show>
  );
}
