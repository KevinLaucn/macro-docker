import {
  emailTranslationEnabled,
  getCachedMessageTranslation,
  isMessageTranslated,
  isTranslationSupported,
} from '@app/features/email-translation';
import { StaticMarkdown } from '@core/component/LexicalMarkdown/component/core/StaticMarkdown';
import { channelTheme } from '@core/component/LexicalMarkdown/theme';
import DotsThree from '@phosphor/dots-three.svg';
import { Button, cn } from '@ui';
import { Match, Show, Switch } from 'solid-js';

import { useEmailRenderingContext } from '../context/email-rendering-context';
import {
  createEmailMessageBody,
  type EmailMessageBodyProps,
} from '../primitives/email-message-body';
export function EmailMessageBody(props: EmailMessageBodyProps) {
  const { showFullHTML, setShowFullHTML, host, hasHiddenReplyStructure } =
    createEmailMessageBody(props, useEmailRenderingContext());

  const messageId = () => props.message.db_id;
  const threadId = () => props.message.thread_db_id;
  const isTranslated = () =>
    emailTranslationEnabled() &&
    isTranslationSupported() &&
    isMessageTranslated(threadId(), messageId());
  const cachedTranslation = () => getCachedMessageTranslation(messageId());

  return (
    <div
      class="ph-no-capture flex flex-col [&_.md-p:first-child]:mt-0 [&_.md-p:last-child]:mb-0"
      onPointerDown={() => {
        if (!props.isBodyExpanded() && props.message.db_id) {
          props.setExpandedMessageBody(props.message.db_id);
          props.setFocusedMessageId(props.message.db_id);
        } else if (props.message.db_id) {
          props.setFocusedMessageId(props.message.db_id);
        }
      }}
    >
      <div
        class="relative"
        classList={{
          isPersonal: props.isPersonal,
          'line-clamp-3': !props.isBodyExpanded(),
        }}
      >
        <Switch>
          {/* PRIVATE-HOOK: email_translation:body-markdown */}
          <Match when={isTranslated() && cachedTranslation()?.translatedText}>
            {(translatedText) => {
              return (
                <StaticMarkdown
                  markdown={translatedText()}
                  theme={channelTheme}
                  target="internal"
                />
              );
            }}
          </Match>
          {/* If available, we use body_macro to render "Macro-fied" email content in static markdown with, e.g. correctly styled document mentions. */}
          <Match when={!showFullHTML() && props.message.body_macro}>
            {(bodyMacro) => {
              return (
                <StaticMarkdown
                  markdown={bodyMacro()}
                  theme={channelTheme}
                  target="internal"
                />
              );
            }}
          </Match>
          <Match when={!props.message.body_html_sanitized}>
            <StaticMarkdown
              markdown={props.message.body_text ?? ''}
              theme={channelTheme}
              target="internal"
            />
          </Match>
          <Match when={true}>{host()}</Match>
        </Switch>
        <Show when={!showFullHTML() && hasHiddenReplyStructure()}>
          <div class="flex items-center mt-1.5 mb-2">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setShowFullHTML(true)}
              class={cn(
                'rounded-md text-ink-extra-muted hover:text-ink-muted',
                props.isFocused ? 'hover:bg-surface' : 'hover:bg-active'
              )}
            >
              <DotsThree />
            </Button>
          </div>
        </Show>
      </div>
    </div>
  );
}
