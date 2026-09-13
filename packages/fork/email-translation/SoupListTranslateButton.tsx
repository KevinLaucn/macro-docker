import { useMaybeSoup } from '@app/features/next-soup/soup-context';
import { useSplitPanelOrThrow } from '@components/app/split-layout/layoutUtils';
import { isEmailEntity } from '@entity';
import { t } from '@macro/i18n';
import CircleNotch from '@phosphor/circle-notch.svg';
import TranslateIcon from '@phosphor/translate.svg';
import { Button, cn, Tooltip } from '@ui';
import { type Accessor, Show } from 'solid-js';
import type { EmailListTranslationItem } from './emailListTranslation';
import {
  clearAllRowTranslations,
  isEmailListTranslated,
  isEmailListTranslating,
  toggleGlobalListTranslation,
} from './emailTranslationState';
import { isTranslationSupported } from './translatorClient';

export function SoupListTranslateButton(props: {
  hideLabel?: boolean;
  class?: string;
  forceVisible?: boolean;
  emailItems?: Accessor<EmailListTranslationItem[]>;
}) {
  const soup = useMaybeSoup();
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

  const isTranslated = () => isEmailListTranslated();
  const isTranslating = () => isEmailListTranslating();
  const isSupported = () => isTranslationSupported();

  const emailItems = () => {
    if (props.emailItems) return props.emailItems();
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

  const label = () =>
    !isSupported()
      ? t('Translation unavailable in this browser')
      : isTranslated()
        ? t('Show original')
        : t('Translate');

  return (
    <Show when={props.forceVisible || isEmailListView()}>
      <Tooltip
        shortcut={hasEmailRows() && !isTranslating() ? 'q' : undefined}
        label={label()}
      >
        <Button
          variant="outline"
          size="sm"
          depth={2}
          disabled={!hasEmailRows() || isTranslating() || !isSupported()}
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
    </Show>
  );
}
