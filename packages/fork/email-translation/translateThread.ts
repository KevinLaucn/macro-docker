import {
  computeMessageSourceFingerprint,
  getCachedMessageTranslation,
  getThreadTitleTranslation,
  getThreadTranslationStatus,
  isThreadDisplayingTranslation,
  normalizeSourceForFingerprint,
  runDeduplicatedTranslationTask,
  setCachedMessageTranslation,
  setMessageOverride,
  setThreadDisplayingTranslation,
  setThreadTitleTranslation,
  setThreadTranslationStatus,
} from './emailTranslationState';
import {
  mapApiItemToMessageTranslation,
  prefetchSavedMessageTranslation,
  type TranslatableMessage,
  translateSingleMessage,
} from './translateMessage';
import { translateTextDetailed } from './translateText';
import {
  emailTranslationClient,
  getEmailTranslationTransport,
  getTargetLanguage,
  hasBrowserTranslatorMock,
} from './translatorClient';
import type { EmailTranslationButtonState, TranslationAction } from './types';

function shouldUseBackendForThread(): boolean {
  if (getEmailTranslationTransport()) return true;
  if (hasBrowserTranslatorMock()) return false;
  return true;
}

export function prefetchSavedThreadTranslation(
  threadId: string | undefined,
  messages: TranslatableMessage[] = [],
  title?: string,
  targetLang?: string
): void {
  if (!threadId) return;
  const lang = targetLang || getTargetLanguage();

  for (const msg of messages) {
    prefetchSavedMessageTranslation(msg, lang);
  }

  if (!shouldUseBackendForThread()) return;

  const existingTitle = getThreadTitleTranslation(threadId, lang);
  const titleFp = title ? normalizeSourceForFingerprint(title) : undefined;
  if (
    existingTitle &&
    existingTitle.status === 'translated' &&
    (!titleFp || existingTitle.sourceFingerprint === titleFp)
  ) {
    return;
  }

  void emailTranslationClient
    .requestThreads({
      thread_ids: [threadId],
      content_type: 'thread_title',
      target_lang: lang,
      action: 'get',
    })
    .then((res) => {
      const items = res.results || (res as any).translations || [];
      const item = items.find((r: any) => r.thread_id === threadId);
      if (item && (item.status === 'translated' || item.status === 'partial')) {
        setThreadTitleTranslation(
          threadId,
          {
            status: item.status,
            translatedTitle: item.translated_subject ?? title,
            sourceHash: item.source_hash,
            sourceFingerprint: titleFp,
            targetLang: lang,
            saved: Boolean(item.saved),
            fromCache: Boolean(item.from_cache),
            model: item.model,
          },
          lang
        );
      }
    })
    .catch(() => {
      // Silent on read-only prefetch failure
    });
}

export function getThreadTranslationButtonState(
  threadId: string | undefined,
  messages: TranslatableMessage[] = [],
  title?: string,
  targetLang?: string
): EmailTranslationButtonState {
  if (!threadId) return 'idle';
  const lang = targetLang || getTargetLanguage();
  const threadStatus = getThreadTranslationStatus(threadId, lang);
  if (threadStatus === 'loading') return 'loading';
  if (threadStatus === 'error' || threadStatus === 'partial') return 'retry';

  const validMessages = messages.filter((m): m is TranslatableMessage & { db_id: string } =>
    Boolean(m.db_id)
  );

  const anyLoading = validMessages.some((m) => {
    const fp = computeMessageSourceFingerprint(m);
    return getCachedMessageTranslation(m.db_id, lang, fp)?.status === 'loading';
  });
  if (anyLoading) return 'loading';

  const anyErrorOrPartial = validMessages.some((m) => {
    const fp = computeMessageSourceFingerprint(m);
    const st = getCachedMessageTranslation(m.db_id, lang, fp)?.status;
    return st === 'error' || st === 'partial';
  });
  if (anyErrorOrPartial) return 'retry';

  const allMessagesTranslated =
    validMessages.length > 0 &&
    validMessages.every((m) => {
      const fp = computeMessageSourceFingerprint(m);
      return (
        getCachedMessageTranslation(m.db_id, lang, fp)?.status === 'translated'
      );
    });

  const titleTranslated = title
    ? getThreadTitleTranslation(threadId, lang)?.status === 'translated'
    : false;

  const hasSavedOrCached =
    allMessagesTranslated ||
    (validMessages.length === 0 && titleTranslated) ||
    threadStatus === 'translated';

  if (!hasSavedOrCached) {
    return 'idle';
  }

  return isThreadDisplayingTranslation(threadId, lang)
    ? 'show_original'
    : 'show_translated';
}

export async function toggleThreadTranslation(
  threadId: string,
  messages: TranslatableMessage[],
  title?: string,
  targetLang?: string
): Promise<void> {
  const lang = targetLang || getTargetLanguage();
  const ids = messages
    .map((m) => m.db_id)
    .filter((id): id is string => Boolean(id));
  const btnState = getThreadTranslationButtonState(
    threadId,
    messages,
    title,
    lang
  );

  if (btnState === 'loading') return;

  if (btnState === 'show_original') {
    // 仅改变显示模式为原文，不清空已取得的译文缓存
    setThreadDisplayingTranslation(threadId, false, ids, lang);
    return;
  }

  if (btnState === 'show_translated') {
    // 所有消息和标题均已有当前版本译文，直接切换回显示译文，不请求 AI
    setThreadTranslationStatus(threadId, 'translated', lang);
    setThreadDisplayingTranslation(threadId, true, ids, lang);
    return;
  }

  const action: TranslationAction = btnState === 'retry' ? 'retry' : 'translate';
  await translateThread(threadId, messages, title, { action, targetLang: lang });
}

export async function translateThread(
  threadId: string,
  messages: TranslatableMessage[],
  title?: string,
  options?: {
    action?: TranslationAction;
    targetLang?: string;
  }
): Promise<void> {
  const lang = options?.targetLang || getTargetLanguage();
  const action: TranslationAction = options?.action || 'translate';
  const ids = messages
    .map((m) => m.db_id)
    .filter((id): id is string => Boolean(id));

  await runDeduplicatedTranslationTask(
    `thread:${threadId}:${lang}:${action}:${ids.join(',')}`,
    async () => {
      setThreadTranslationStatus(threadId, 'loading', lang);

      try {
        let partial = false;
        let hasError = false;
        const titleFp = title ? normalizeSourceForFingerprint(title) : undefined;

        const titleTask = (async () => {
          if (!title) return;
          const existingTitle = getThreadTitleTranslation(threadId, lang);
          if (
            action !== 'retranslate' &&
            existingTitle?.status === 'translated' &&
            (!titleFp || existingTitle.sourceFingerprint === titleFp)
          ) {
            return;
          }

          if (shouldUseBackendForThread()) {
            try {
              const res = await emailTranslationClient.requestThreads({
                thread_ids: [threadId],
                content_type: 'thread_title',
                target_lang: lang,
                action,
              });
              const items = res.results || (res as any).translations || [];
              const item = items.find((r: any) => r.thread_id === threadId);
              if (
                item &&
                (item.status === 'translated' || item.status === 'partial') &&
                item.saved
              ) {
                if (item.status === 'partial') partial = true;
                setThreadTitleTranslation(
                  threadId,
                  {
                    status: item.status,
                    translatedTitle: item.translated_subject ?? title,
                    sourceHash: item.source_hash,
                    sourceFingerprint: titleFp,
                    targetLang: lang,
                    saved: true,
                    fromCache: Boolean(item.from_cache),
                    model: item.model,
                  },
                  lang
                );
                return;
              }
              hasError = true;
              setThreadTitleTranslation(
                threadId,
                { status: 'error', sourceFingerprint: titleFp, targetLang: lang },
                lang
              );
              return;
            } catch (err) {
              console.error(
                `[EmailTranslation] Failed to translate thread title ${threadId}:`,
                err
              );
              hasError = true;
              setThreadTitleTranslation(
                threadId,
                { status: 'error', sourceFingerprint: titleFp, targetLang: lang },
                lang
              );
              return;
            }
          }

          try {
            const translatedTitle = await translateTextDetailed(title, {
              targetLang: lang,
            });
            partial ||= translatedTitle.partial;
            setThreadTitleTranslation(
              threadId,
              {
                status: translatedTitle.partial ? 'partial' : 'translated',
                translatedTitle: translatedTitle.text,
                sourceFingerprint: titleFp,
                targetLang: lang,
                saved: true,
              },
              lang
            );
          } catch (err) {
            console.error(
              `[EmailTranslation] Failed to translate thread title ${threadId}:`,
              err
            );
            hasError = true;
            setThreadTitleTranslation(
              threadId,
              { status: 'error', sourceFingerprint: titleFp, targetLang: lang },
              lang
            );
          }
        })();

        const messagesTask = (async () => {
          const validMessages = messages.filter(
            (m): m is TranslatableMessage & { db_id: string } => Boolean(m.db_id)
          );
          if (validMessages.length === 0) return;

          const pendingMessages: Array<TranslatableMessage & { db_id: string }> =
            [];

          for (const msg of validMessages) {
            setMessageOverride(msg.db_id, 'inherit', lang);
            const fp = computeMessageSourceFingerprint(msg);
            const existing = getCachedMessageTranslation(msg.db_id, lang, fp);
            if (
              action !== 'retranslate' &&
              existing?.status === 'translated'
            ) {
              continue;
            }
            setCachedMessageTranslation(
              msg.db_id,
              {
                ...existing,
                status: 'loading',
                sourceFingerprint: fp,
                targetLang: lang,
              },
              lang
            );
            pendingMessages.push(msg);
          }

          if (pendingMessages.length === 0) return;

          if (shouldUseBackendForThread()) {
            try {
              const res = await emailTranslationClient.requestMessages({
                message_ids: pendingMessages.map((m) => m.db_id),
                target_lang: lang,
                action,
              });
              const items = res.results || (res as any).translations || [];
              const byId = new Map(
                items.map((item: any) => [item.message_id, item])
              );
              for (const msg of pendingMessages) {
                const fp = computeMessageSourceFingerprint(msg);
                const item = byId.get(msg.db_id);
                if (!item || !item.saved) {
                  hasError = true;
                  setCachedMessageTranslation(
                    msg.db_id,
                    {
                      status: 'error',
                      sourceFingerprint: fp,
                      targetLang: lang,
                      saved: false,
                    },
                    lang
                  );
                  continue;
                }
                const mapped = mapApiItemToMessageTranslation(item, msg, fp);
                if (mapped.status === 'partial') partial = true;
                if (mapped.status === 'error') hasError = true;
                setCachedMessageTranslation(msg.db_id, mapped, lang);
              }
              return;
            } catch (err) {
              console.error(
                `[EmailTranslation] Failed to batch-translate thread messages ${threadId}:`,
                err
              );
              hasError = true;
              for (const msg of pendingMessages) {
                const fp = computeMessageSourceFingerprint(msg);
                setCachedMessageTranslation(
                  msg.db_id,
                  {
                    status: 'error',
                    sourceFingerprint: fp,
                    targetLang: lang,
                    saved: false,
                  },
                  lang
                );
              }
              return;
            }
          }

          await Promise.all(
            pendingMessages.map(async (msg) => {
              const translated = await translateSingleMessage(msg, {
                action,
                targetLang: lang,
              });
              if (translated.status === 'partial') {
                partial = true;
              } else if (translated.status === 'error') {
                hasError = true;
              }
            })
          );
        })();

        await Promise.all([titleTask, messagesTask]);

        if (hasError) {
          setThreadTranslationStatus(
            threadId,
            partial ? 'partial' : 'error',
            lang
          );
        } else {
          setThreadTranslationStatus(
            threadId,
            partial ? 'partial' : 'translated',
            lang
          );
          setThreadDisplayingTranslation(threadId, true, ids, lang);
        }
      } catch (err) {
        console.error(
          `[EmailTranslation] Failed to translate thread ${threadId}:`,
          err
        );
        setThreadTranslationStatus(threadId, 'error', lang);
      }
    }
  );
}
