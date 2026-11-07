import { stripOwnTrackingPixelsFromHtml } from '@macro/fork-read-receipts/utils';
import {
  computeMessageSourceFingerprint,
  getCachedMessageTranslation,
  runDeduplicatedTranslationTask,
  setCachedMessageTranslation,
} from './emailTranslationState';
import { planAndTranslateHtmlDetailed } from './translationPlanner';
import { translateTextDetailed } from './translateText';
import {
  emailTranslationClient,
  getEmailTranslationTransport,
  getTargetLanguage,
  hasBrowserTranslatorMock,
} from './translatorClient';
import type {
  MessageTranslationApiItem,
  MessageTranslationData,
  TranslationAction,
} from './types';

export type TranslatableMessage = {
  db_id?: string | null;
  thread_db_id?: string | null;
  link_id?: string | null;
  is_sent?: boolean | null;
  body_html_sanitized?: string | null;
  body_replyless?: string | null;
  body_macro?: string | null;
  body_text?: string | null;
};

function shouldUseBackendForMessage(message: TranslatableMessage): boolean {
  if (!message.db_id) return false;
  if (getEmailTranslationTransport()) return true;
  if (hasBrowserTranslatorMock()) return false;
  return true;
}

export function mapApiItemToMessageTranslation(
  item: MessageTranslationApiItem,
  message: TranslatableMessage,
  sourceFingerprint: string
): MessageTranslationData {
  const isSent = Boolean(message.is_sent);
  const rawHtml = item.translated_html ?? undefined;
  const rawReplyless = item.translated_replyless_html ?? undefined;

  return {
    status:
      item.status === 'translated'
        ? 'translated'
        : item.status === 'partial'
          ? 'partial'
          : item.status === 'none'
            ? 'idle'
            : 'error',
    translatedHtml:
      rawHtml && isSent ? stripOwnTrackingPixelsFromHtml(rawHtml) : rawHtml,
    translatedReplylessHtml:
      rawReplyless && isSent
        ? stripOwnTrackingPixelsFromHtml(rawReplyless)
        : rawReplyless,
    translatedText: item.translated_text ?? undefined,
    translatedSubject: item.translated_subject ?? undefined,
    translatedSnippet: item.translated_snippet ?? undefined,
    sourceHash: item.source_hash,
    sourceFingerprint,
    targetLang: item.target_lang,
    saved: Boolean(item.saved),
    fromCache: Boolean(item.from_cache),
    model: item.model,
  };
}

const pendingPrefetchByLang = new Map<
  string,
  Map<string, TranslatableMessage>
>();
let prefetchScheduled = false;

function flushPrefetchBatch(): void {
  prefetchScheduled = false;
  const entries = Array.from(pendingPrefetchByLang.entries());
  pendingPrefetchByLang.clear();

  for (const [lang, msgMap] of entries) {
    const messages = Array.from(msgMap.values());
    const ids = messages
      .map((m) => m.db_id)
      .filter((id): id is string => Boolean(id));
    if (ids.length === 0) continue;

    void emailTranslationClient
      .requestMessages({
        message_ids: ids,
        target_lang: lang,
        action: 'get',
      })
      .then((res) => {
        for (const item of res.results) {
          const msg = msgMap.get(item.message_id);
          if (!msg) continue;
          if (item.status === 'translated' || item.status === 'partial') {
            const fp = computeMessageSourceFingerprint(msg);
            const mapped = mapApiItemToMessageTranslation(item, msg, fp);
            setCachedMessageTranslation(item.message_id, mapped, lang);
          }
        }
      })
      .catch(() => {
        // Silent on read-only prefetch failure (e.g., offline or unauthenticated)
      });
  }
}

/**
 * Prefetches already-saved translations from PostgreSQL (`action: 'get'`) when opening an email.
 * Never triggers AI model generation for untranslated emails.
 */
export function prefetchSavedMessageTranslation(
  message: TranslatableMessage,
  targetLang?: string
): void {
  const mid = message.db_id;
  if (!mid || !shouldUseBackendForMessage(message)) return;
  const lang = targetLang || getTargetLanguage();
  const fp = computeMessageSourceFingerprint(message);
  const existing = getCachedMessageTranslation(mid, lang, fp);
  if (existing && existing.status !== 'idle') {
    return;
  }

  let langMap = pendingPrefetchByLang.get(lang);
  if (!langMap) {
    langMap = new Map();
    pendingPrefetchByLang.set(lang, langMap);
  }
  langMap.set(mid, message);

  if (!prefetchScheduled) {
    prefetchScheduled = true;
    queueMicrotask(flushPrefetchBatch);
  }
}

export async function translateSingleMessage(
  message: TranslatableMessage,
  options?: {
    action?: TranslationAction;
    targetLang?: string;
    linkId?: string;
  }
): Promise<MessageTranslationData> {
  const lang = options?.targetLang || getTargetLanguage();
  const action: TranslationAction = options?.action || 'translate';
  const fp = computeMessageSourceFingerprint(message);
  const mid = message.db_id;

  if (mid && action === 'translate') {
    const cached = getCachedMessageTranslation(mid, lang, fp);
    if (cached?.status === 'translated') {
      return cached;
    }
  }

  const dedupKey = `msg:${mid || 'anon'}:${lang}:${action}:${fp}`;

  return await runDeduplicatedTranslationTask(dedupKey, async () => {
    const previous = mid
      ? getCachedMessageTranslation(mid, lang, fp)
      : undefined;

    if (shouldUseBackendForMessage(message) && mid) {
      try {
        const res = await emailTranslationClient.requestMessages({
          message_ids: [mid],
          target_lang: lang,
          action,
          link_id: options?.linkId ?? message.link_id ?? undefined,
        });
        const item = res.results.find((r) => r.message_id === mid);
        if (!item) {
          throw new Error(`Missing translation response for message ${mid}`);
        }
        const mapped = mapApiItemToMessageTranslation(item, message, fp);
        if (mapped.status === 'error' || !item.saved) {
          if (action !== 'get') {
            mapped.status = 'error';
            mapped.saved = false;
          }
        }
        setCachedMessageTranslation(mid, mapped, lang);
        return mapped;
      } catch (err) {
        console.error(
          `[EmailTranslation] Failed to translate message ${mid}:`,
          err
        );
        const errData: MessageTranslationData = {
          status: 'error',
          sourceFingerprint: fp,
          targetLang: lang,
          saved: false,
          errorMessage: err instanceof Error ? err.message : String(err),
        };
        setCachedMessageTranslation(mid, errData, lang);
        return errData;
      }
    }

    // Fallback local segmented batch planner (used when testing standalone DOM/text objects)
    const result: MessageTranslationData = {
      status: 'translated',
      sourceFingerprint: fp,
      targetLang: lang,
      saved: true,
    };
    let partial = false;
    const missingIds: string[] = [];
    const retryOnlyIds =
      action === 'retry' && previous?.missingSegmentIds?.length
        ? new Set(previous.missingSegmentIds)
        : undefined;

    try {
      const isSent = Boolean(message.is_sent);
      if (message.body_html_sanitized) {
        const rawHtml = isSent
          ? stripOwnTrackingPixelsFromHtml(
              message.body_html_sanitized.toString()
            )
          : message.body_html_sanitized.toString();
        const translatedHtml = await planAndTranslateHtmlDetailed(rawHtml, {
          targetLang: lang,
          onlySegmentIds: retryOnlyIds,
        });
        result.translatedHtml = isSent
          ? stripOwnTrackingPixelsFromHtml(translatedHtml.html)
          : translatedHtml.html;
        partial ||= translatedHtml.partial;
        if (translatedHtml.missingSegmentIds) {
          missingIds.push(...translatedHtml.missingSegmentIds);
        }

        if (message.body_replyless) {
          const rawReplyless = isSent
            ? stripOwnTrackingPixelsFromHtml(message.body_replyless.toString())
            : message.body_replyless.toString();
          const translatedReplylessHtml = await planAndTranslateHtmlDetailed(
            rawReplyless,
            {
              targetLang: lang,
              onlySegmentIds: retryOnlyIds,
            }
          );
          result.translatedReplylessHtml = isSent
            ? stripOwnTrackingPixelsFromHtml(translatedReplylessHtml.html)
            : translatedReplylessHtml.html;
          partial ||= translatedReplylessHtml.partial;
        }
      } else if (message.body_macro) {
        const translatedText = await translateTextDetailed(
          message.body_macro.toString(),
          { targetLang: lang }
        );
        result.translatedText = translatedText.text;
        partial ||= translatedText.partial;
      } else if (message.body_text) {
        const translatedText = await translateTextDetailed(
          message.body_text.toString(),
          { targetLang: lang }
        );
        result.translatedText = translatedText.text;
        partial ||= translatedText.partial;
      }

      // Also translate snippet for collapsed messages / previews
      let rawSnippet = '';
      if (message.body_text) {
        rawSnippet = message.body_text.replace(/\s+/g, ' ').trim();
      } else if (message.body_html_sanitized) {
        const cleanHtml = stripOwnTrackingPixelsFromHtml(
          message.body_html_sanitized.toString()
        );
        const parser = new DOMParser();
        const doc = parser.parseFromString(cleanHtml, 'text/html');
        rawSnippet = doc.body.textContent?.replace(/\s+/g, ' ').trim() ?? '';
      }
      if (rawSnippet) {
        const translatedSnippet = await translateTextDetailed(rawSnippet, {
          targetLang: lang,
        });
        result.translatedSnippet = translatedSnippet.text;
        partial ||= translatedSnippet.partial;
      }

      if (partial) {
        result.status = 'partial';
        result.missingSegmentIds =
          missingIds.length > 0 ? missingIds : undefined;
      }

      if (mid) {
        setCachedMessageTranslation(mid, result, lang);
      }

      return result;
    } catch (err) {
      console.error(
        `[EmailTranslation] Failed to translate message ${message.db_id}:`,
        err
      );
      const errData: MessageTranslationData = {
        status: 'error',
        sourceFingerprint: fp,
        targetLang: lang,
        saved: false,
      };
      if (mid) {
        setCachedMessageTranslation(mid, errData, lang);
      }
      return errData;
    }
  });
}
