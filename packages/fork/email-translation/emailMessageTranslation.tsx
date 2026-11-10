import type { EmailMessage } from '@app/features/email-message/core/email-message';
import { stripOwnTrackingPixelsFromHtml } from '@macro/fork-read-receipts';
import { createEffect, Show } from 'solid-js';
import { EmailTranslateButton } from './EmailTranslateButton';
import {
  computeMessageSourceFingerprint,
  emailTranslationEnabled,
  getCachedMessageTranslation,
  getMessageTranslationButtonState,
  isMessageTranslated,
  setCachedMessageTranslation,
  setMessageOverride,
} from './emailTranslationState';
import {
  prefetchSavedMessageTranslation,
  translateSingleMessage,
} from './translateMessage';
import { getTargetLanguage, isTranslationSupported } from './translatorClient';
import type { TranslationAction } from './types';

export async function toggleSingleMessageTranslation(
  message: EmailMessage,
  targetLang?: string
): Promise<void> {
  const mid = message.db_id;
  if (!mid) return;
  const lang = targetLang || getTargetLanguage();
  const btnState = getMessageTranslationButtonState(message, lang);
  if (btnState === 'loading') return;

  if (btnState === 'show_original') {
    // 仅改变显示模式为原文，不清空已取得的译文缓存
    setMessageOverride(mid, 'original', lang);
    return;
  }

  if (btnState === 'show_translated') {
    // 已有已保存/缓存译文，直接切换回显示译文，不调用 AI
    setMessageOverride(mid, 'translated', lang);
    return;
  }

  const action: TranslationAction = btnState === 'retry' ? 'retry' : 'translate';
  const fp = computeMessageSourceFingerprint(message);
  setMessageOverride(mid, 'translated', lang);
  setCachedMessageTranslation(
    mid,
    {
      ...getCachedMessageTranslation(mid, lang, fp),
      status: 'loading',
      sourceFingerprint: fp,
      targetLang: lang,
    },
    lang
  );
  const data = await translateSingleMessage(message, {
    action,
    targetLang: lang,
  });
  setCachedMessageTranslation(mid, data, lang);
}

export function EmailMessageTranslateButton(props: { message: EmailMessage }) {
  const messageId = () => props.message.db_id;
  const fp = () => computeMessageSourceFingerprint(props.message);
  const cached = () =>
    getCachedMessageTranslation(messageId(), undefined, fp());
  const buttonState = () => getMessageTranslationButtonState(props.message);

  createEffect(() => {
    if (emailTranslationEnabled() && props.message.db_id) {
      prefetchSavedMessageTranslation(props.message);
    }
  });

  const handleToggle = () => {
    void toggleSingleMessageTranslation(props.message);
  };

  return (
    <Show
      when={
        emailTranslationEnabled() &&
        isTranslationSupported() &&
        Boolean(props.message.db_id)
      }
    >
      <EmailTranslateButton
        state={cached()?.status ?? 'idle'}
        buttonState={buttonState()}
        scope="message"
        onClick={handleToggle}
      />
    </Show>
  );
}

export function useEmailMessageTranslation(message: () => EmailMessage) {
  const messageId = () => message().db_id;
  const threadId = () => message().thread_db_id;
  const fp = () => computeMessageSourceFingerprint(message());

  createEffect(() => {
    const msg = message();
    if (emailTranslationEnabled() && msg?.db_id) {
      prefetchSavedMessageTranslation(msg);
    }
  });

  const cachedTranslation = () =>
    getCachedMessageTranslation(messageId(), undefined, fp());

  const isTranslated = () => {
    if (!emailTranslationEnabled() || !isTranslationSupported()) return false;
    if (!isMessageTranslated(threadId(), messageId())) return false;
    const status = cachedTranslation()?.status;
    return status === 'translated' || status === 'partial';
  };

  const sanitizeOwnSentPixels = (html: string | undefined) => {
    if (!html) return undefined;
    return message().is_sent ? stripOwnTrackingPixelsFromHtml(html) : html;
  };

  const usesPlainTextView = () =>
    !message().body_html_sanitized || Boolean(message().body_macro);

  return {
    isTranslated,
    cachedTranslation,
    translatedHtml: () =>
      isTranslated()
        ? sanitizeOwnSentPixels(cachedTranslation()?.translatedHtml)
        : undefined,
    translatedReplylessHtml: () =>
      isTranslated()
        ? sanitizeOwnSentPixels(cachedTranslation()?.translatedReplylessHtml)
        : undefined,
    translatedText: () => {
      if (!isTranslated()) return undefined;
      const cached = cachedTranslation();
      if (cached?.translatedText) return cached.translatedText;
      if (
        usesPlainTextView() &&
        (cached?.translatedReplylessHtml || cached?.translatedHtml)
      ) {
        const rawHtml = cached.translatedReplylessHtml || cached.translatedHtml;
        if (rawHtml) {
          const stripped = rawHtml
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<\/p>/gi, '\n\n')
            .replace(/<[^>]+>/g, '')
            .replace(/&nbsp;/g, ' ')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&#39;/g, "'")
            .replace(/&quot;/g, '"')
            .trim();
          if (stripped) return stripped;
        }
      }
      return undefined;
    },
  };
}

export function getEmailCollapsedSnippet(message: EmailMessage): string {
  if (emailTranslationEnabled() && isTranslationSupported()) {
    if (isMessageTranslated(message.thread_db_id, message.db_id)) {
      const fp = computeMessageSourceFingerprint(message);
      const cached = getCachedMessageTranslation(message.db_id, undefined, fp);
      if (
        (cached?.status === 'translated' || cached?.status === 'partial') &&
        cached?.translatedSnippet
      ) {
        return cached.translatedSnippet;
      }
    }
  }

  if (message.body_text) {
    return message.body_text.replace(/\s+/g, ' ').trim();
  }
  if (message.body_html_sanitized) {
    const cleanHtml = stripOwnTrackingPixelsFromHtml(
      message.body_html_sanitized
    );
    const parser = new DOMParser();
    const doc = parser.parseFromString(cleanHtml, 'text/html');
    return doc.body.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  }
  return '';
}
