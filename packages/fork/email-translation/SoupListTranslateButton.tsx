import { useSplitPanelOrThrow } from '@components/app/split-layout/layoutUtils';
import { t } from '@macro/i18n';
import TranslateIcon from '@phosphor/translate.svg';
import { Button, cn, Tooltip } from '@ui';
import { Show } from 'solid-js';
import { requestBrowserTranslation } from './browserTranslation';

export function SoupListTranslateButton(props: {
  hideLabel?: boolean;
  class?: string;
  forceVisible?: boolean;
  size?: 'sm' | 'md' | 'lg';
  square?: boolean;
}) {
  const panel = useSplitPanelOrThrow();

  // Soup is shared by channels, documents, CRM, and other views. This
  // email-only control is intentionally rendered only for email lists.
  const isEmailListView = () => {
    const content = panel.handle.content();
    return (
      content.type === 'component' &&
      (content.id === 'inbox' || content.id === 'mail')
    );
  };

  const label = () => t('Translate with browser');

  const isSquare = () => props.square ?? Boolean(props.hideLabel);
  const buttonSize = () => props.size ?? (props.hideLabel ? 'md' : 'sm');

  return (
    <Show when={props.forceVisible || isEmailListView()}>
      <Tooltip
        shortcut={undefined}
        label={label()}
      >
        <Button
          variant="outline"
          size={buttonSize()}
          square={isSquare()}
          depth={2}
          onClick={requestBrowserTranslation}
          class={cn(
            'bg-surface transition-colors',
            isSquare() && 'rounded-lg',
            props.class
          )}
          aria-label={label()}
        >
          <TranslateIcon
            class={cn(
              isSquare() ? 'size-4' : 'size-3.5',
              'text-ink-muted'
            )}
          />
          <Show when={!props.hideLabel}>
            <span>{t('Translate')}</span>
          </Show>
        </Button>
      </Tooltip>
    </Show>
  );
}
