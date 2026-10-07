import type { EmailMessage } from '@app/features/email-message/core/email-message';
import { Show } from 'solid-js';
import { requestBrowserTranslation } from './browserTranslation';
import { EmailTranslateButton } from './EmailTranslateButton';

export function EmailMessageTranslateButton(props: { message: EmailMessage }) {
  return (
    <Show when={props.message.db_id}>
      <EmailTranslateButton
        state="idle"
        scope="message"
        onClick={requestBrowserTranslation}
      />
    </Show>
  );
}

export function useEmailMessageTranslation(_message: () => EmailMessage) {
  return {
    isTranslated: () => false,
    cachedTranslation: () => undefined,
    translatedHtml: () => undefined,
    translatedReplylessHtml: () => undefined,
    translatedText: () => undefined,
  };
}

export function getEmailCollapsedSnippet(message: EmailMessage): string {
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
