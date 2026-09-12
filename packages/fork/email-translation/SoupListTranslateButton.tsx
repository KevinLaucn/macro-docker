import { useMaybeSoup } from '@app/features/next-soup/soup-context';
import { isEmailEntity } from '@entity';
import { t } from '@macro/i18n';
import CircleNotch from '@phosphor/circle-notch.svg';
import TranslateIcon from '@phosphor/translate.svg';
import { Button, cn, Tooltip } from '@ui';
import { Show } from 'solid-js';
import {
  clearAllRowTranslations,
  isEmailListTranslated,
  isEmailListTranslating,
  toggleGlobalListTranslation,
} from './emailTranslationState';

export function SoupListTranslateButton(props: {
  hideLabel?: boolean;
  class?: string;
}) {
  const soup = useMaybeSoup();

  const isTranslated = () => isEmailListTranslated();
  const isTranslating = () => isEmailListTranslating();

  const emailItems = () => {
    const rows = soup?.items.rows() ?? [];
    return rows
      .map((r) => r.original)
      .filter(isEmailEntity)
      .map((e) => ({
        id: e.id,
        name: e.name,
        snippet: e.snippet,
      }));
  };

  const hasEmailRows = () => emailItems().length > 0;

  const handleClick = async () => {
    if (isTranslating()) return;
    if (isTranslated()) {
      clearAllRowTranslations();
    } else {
      await toggleGlobalListTranslation(emailItems());
    }
  };

  const label = () => (isTranslated() ? t('Show original') : t('Translate'));

  return (
    <Tooltip
      shortcut={hasEmailRows() && !isTranslating() ? 'q' : undefined}
      label={label()}
    >
      <Button
        variant="outline"
        size="sm"
        depth={2}
        disabled={!hasEmailRows() || isTranslating()}
        onClick={handleClick}
        class={cn(
          'bg-surface transition-colors',
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
    </Tooltip>
  );
}
