import { useMaybeSoup } from '@app/features/next-soup/soup-context';
import { useSplitPanelOrThrow } from '@components/app/split-layout/layoutUtils';
import { isEmailEntity } from '@entity';
import CircleNotch from '@phosphor/circle-notch.svg';
import TranslateIcon from '@phosphor/translate.svg';
import { Button, cn, Tooltip } from '@ui';
import { type Accessor, Show } from 'solid-js';
import { resolveTranslationButtonLabel } from './EmailTranslateButton';
import type { EmailListTranslationItem } from './emailListTranslation';
import { useMaybeEmailListTranslationContext } from './emailListTranslationContext';
import {
  emailTranslationEnabled,
  getListTranslationButtonState,
  toggleGlobalListTranslation,
} from './emailTranslationState';
import { isTranslationSupported } from './translatorClient';

export function SoupListTranslateButton(props: {
  hideLabel?: boolean;
  class?: string;
  forceVisible?: boolean;
  emailItems?: Accessor<EmailListTranslationItem[]>;
  size?: 'sm' | 'md' | 'lg';
  square?: boolean;
}) {
  const soup = useMaybeSoup();
  const listTranslationContext = useMaybeEmailListTranslationContext();
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

  const emailItems = (): EmailListTranslationItem[] => {
    if (props.emailItems) return props.emailItems();
    const contextItems = listTranslationContext?.items() ?? [];
    if (contextItems.length > 0) return contextItems;
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
  const buttonState = () => getListTranslationButtonState(emailItems());
  const isLoading = () => buttonState() === 'loading';
  const isActive = () => buttonState() === 'show_original';
  const isRetry = () => buttonState() === 'retry';

  const label = () => resolveTranslationButtonLabel(buttonState());

  const handleClick = () => {
    if (isLoading() || !hasEmailRows()) return;
    void toggleGlobalListTranslation(emailItems());
  };

  const isSquare = () => props.square ?? Boolean(props.hideLabel);
  const buttonSize = () => props.size ?? (props.hideLabel ? 'md' : 'sm');

  return (
    <Show
      when={
        emailTranslationEnabled() &&
        isTranslationSupported() &&
        (props.forceVisible || isEmailListView())
      }
    >
      <Tooltip
        shortcut={hasEmailRows() && !isLoading() ? 'q' : undefined}
        label={label()}
      >
        <Button
          variant="secondary"
          size={buttonSize()}
          disabled={!hasEmailRows() || isLoading()}
          onClick={handleClick}
          data-translation-state={buttonState()}
          class={cn(
            'bg-surface transition-colors',
            isSquare() && 'rounded-lg',
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
                  isSquare() ? 'size-4' : 'size-3.5',
                  isActive()
                    ? 'text-accent'
                    : isRetry()
                      ? 'text-danger'
                      : 'text-ink-muted'
                )}
              />
            }
          >
            <CircleNotch
              class={cn(
                isSquare() ? 'size-4' : 'size-3.5',
                'animate-spin text-ink-placeholder'
              )}
            />
          </Show>
          <Show when={!props.hideLabel}>
            <span>{label()}</span>
          </Show>
        </Button>
      </Tooltip>
    </Show>
  );
}
