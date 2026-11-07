import { t } from '@macro/i18n';
import CircleNotch from '@phosphor/circle-notch.svg';
import TranslateIcon from '@phosphor/translate.svg';
import { Button, cn } from '@ui';
import { Match, Switch } from 'solid-js';
import type { EmailTranslationButtonState, TranslationStatus } from './types';

export interface EmailTranslateButtonProps {
  state: TranslationStatus;
  buttonState?: EmailTranslationButtonState;
  scope: 'row' | 'thread' | 'message';
  onClick: (e: MouseEvent) => void;
  disabled?: boolean;
  class?: string;
}

export function resolveTranslationButtonLabel(
  buttonState: EmailTranslationButtonState
): string {
  switch (buttonState) {
    case 'loading':
      return t('翻译中');
    case 'show_original':
      return t('显示原文');
    case 'show_translated':
      return t('显示译文');
    case 'retry':
      return t('失败重试');
    case 'idle':
    default:
      return t('AI翻译');
  }
}

export function EmailTranslateButton(props: EmailTranslateButtonProps) {
  const effectiveButtonState = (): EmailTranslationButtonState => {
    if (props.buttonState) return props.buttonState;
    if (props.state === 'loading') return 'loading';
    if (props.state === 'error' || props.state === 'partial') return 'retry';
    if (props.state === 'translated') return 'show_original';
    return 'idle';
  };

  const isLoading = () => effectiveButtonState() === 'loading';
  const isActive = () => effectiveButtonState() === 'show_original';
  const isRetry = () => effectiveButtonState() === 'retry';

  const tooltipLabel = () =>
    resolveTranslationButtonLabel(effectiveButtonState());

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      disabled={props.disabled || isLoading()}
      aria-label={tooltipLabel()}
      data-translation-state={effectiveButtonState()}
      onClick={(e: MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();
        props.onClick(e);
      }}
      onMouseDown={(e: MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();
      }}
      class={cn(
        'transition-colors',
        isActive() && 'text-accent hover:text-accent/80',
        isRetry() && 'text-danger hover:text-danger/80',
        props.class
      )}
    >
      <Switch>
        <Match when={isLoading()}>
          <CircleNotch class="size-3.5 animate-spin text-ink-placeholder" />
        </Match>
        <Match when={true}>
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
        </Match>
      </Switch>
    </Button>
  );
}
