import type { EmailMessage } from '@app/features/email-message/core/email-message';
import { Show } from 'solid-js';
import { EmailTranslateButton } from './EmailTranslateButton';
import {
  emailTranslationEnabled,
  getCachedMessageTranslation,
  isMessageTranslated,
  setCachedMessageTranslation,
  setMessageOverride,
} from './emailTranslationState';
import { translateSingleMessage } from './translateMessage';
import { isTranslationSupported } from './translatorClient';

export function EmailMessageTranslateButton(props: { message: EmailMessage }) {
  const messageId = () => props.message.db_id;
  const threadId = () => props.message.thread_db_id;
  const translated = () => isMessageTranslated(threadId(), messageId());
  const cached = () => getCachedMessageTranslation(messageId());
  const btnState = () => {
    if (cached()?.status === 'loading') return 'loading' as const;
    if (translated()) return 'translated' as const;
    return 'idle' as const;
  };

  const handleToggle = async () => {
    const mid = messageId();
    if (translated()) {
      setMessageOverride(mid, 'original');
      return;
    }

    setMessageOverride(mid, 'translated');
    if (cached()?.status !== 'translated') {
      setCachedMessageTranslation(mid, { status: 'loading' });
      const data = await translateSingleMessage(props.message);
      setCachedMessageTranslation(mid, data);
    }
  };

  return (
    <Show when={emailTranslationEnabled() && isTranslationSupported()}>
      <EmailTranslateButton
        state={btnState()}
        scope="message"
        onClick={handleToggle}
      />
    </Show>
  );
}

export function useEmailMessageTranslation(message: () => EmailMessage) {
  const messageId = () => message().db_id;
  const threadId = () => message().thread_db_id;
  const isTranslated = () =>
    emailTranslationEnabled() &&
    isTranslationSupported() &&
    isMessageTranslated(threadId(), messageId());
  const cachedTranslation = () => getCachedMessageTranslation(messageId());

  return {
    isTranslated,
    cachedTranslation,
    translatedHtml: () =>
      isTranslated() ? cachedTranslation()?.translatedHtml : undefined,
    translatedReplylessHtml: () =>
      isTranslated() ? cachedTranslation()?.translatedReplylessHtml : undefined,
    translatedText: () =>
      isTranslated() ? cachedTranslation()?.translatedText : undefined,
  };
}

export function getEmailCollapsedSnippet(message: EmailMessage): string {
  if (emailTranslationEnabled() && isTranslationSupported()) {
    if (isMessageTranslated(message.thread_db_id, message.db_id)) {
      const cached = getCachedMessageTranslation(message.db_id);
      if (cached?.translatedSnippet) return cached.translatedSnippet;
    }
  }

  if (message.body_text) {
    return message.body_text.replace(/\s+/g, ' ').trim();
  }
  if (message.body_html_sanitized) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(
      message.body_html_sanitized,
      'text/html'
    );
    return doc.body.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  }
  return '';
}
