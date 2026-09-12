import { t } from '@macro/i18n';
import CircleNotch from '@phosphor/circle-notch.svg';
import TranslateIcon from '@phosphor/translate.svg';
import { Button, cn } from '@ui';
import { Match, Switch } from 'solid-js';
import type { TranslationStatus } from './types';

export interface EmailTranslateButtonProps {
  state: TranslationStatus;
  scope: 'row' | 'thread' | 'message';
  onClick: (e: MouseEvent) => void;
  disabled?: boolean;
  class?: string;
}

export function EmailTranslateButton(props: EmailTranslateButtonProps) {
  const isPartial = () => props.state === 'partial';
  const isTranslated = () => props.state === 'translated' || isPartial();
  const isLoading = () => props.state === 'loading';

  const tooltipLabel = () =>
    isPartial()
      ? t('Partial translation failed. Original text was kept.')
      : isTranslated()
        ? t('Show original')
        : t('Translate');

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      disabled={props.disabled || isLoading()}
      label={tooltipLabel()}
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
        isTranslated() && 'text-accent hover:text-accent/80',
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
              isTranslated() ? 'text-accent' : 'text-ink-muted'
            )}
          />
        </Match>
      </Switch>
    </Button>
  );
}
