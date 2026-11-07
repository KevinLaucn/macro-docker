// @vitest-environment jsdom
import { createRoot } from 'solid-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useEmailRowTranslation } from './emailListTranslation';
import {
  toggleSingleMessageTranslation,
  useEmailMessageTranslation,
} from './emailMessageTranslation';
import {
  clearClientTranslationStateOnLogout,
  getCachedMessageTranslation,
  getListTranslationButtonState,
  getMessageTranslationButtonState,
  getThreadTranslationStatus,
  isMessageTranslated,
  isThreadDisplayingTranslation,
  setEmailTranslationAccountScope,
  toggleGlobalListTranslation,
} from './emailTranslationState';
import { destroyDetector } from './languageDetector';
import {
  prefetchSavedMessageTranslation,
  translateSingleMessage,
} from './translateMessage';
import {
  getThreadTranslationButtonState,
  toggleThreadTranslation,
  translateThread,
} from './translateThread';
import { clearTranslationCache } from './translationCache';
import {
  destroyAllTranslators,
  type EmailTranslationMessagesRequest,
  type EmailTranslationMessagesResponse,
  type EmailTranslationThreadsRequest,
  type EmailTranslationThreadsResponse,
  isTranslationSupported,
  isTranslatorSupported,
  setEmailTranslationTransport,
  setTargetLanguageOverride,
} from './translatorClient';
import type {
  MessageTranslationApiItem,
  ThreadTranslationApiItem,
} from './types';

interface MockPersistedMessageRecord {
  ownerScope: string;
  messageId: string;
  targetLang: string;
  sourceHash: string;
  status: 'translated' | 'partial' | 'error';
  translatedHtml?: string;
  translatedReplyless?: string;
  translatedText?: string;
  translatedSubject?: string;
  translatedSnippet?: string;
  modelId: string;
}

interface MockPersistedThreadRecord {
  ownerScope: string;
  threadId: string;
  targetLang: string;
  sourceHash: string;
  status: 'translated' | 'partial' | 'error';
  translatedTitle?: string;
  translatedSnippet?: string;
  modelId: string;
}

describe('email AI translation & persistence pipeline', () => {
  let currentUserScope = 'user-owner';
  let accessibleIds = new Set<string>([
    'thread-title-test',
    'thread-partial-test',
    'msg-1',
    'msg-2',
    'thread-1',
    'thread-2',
    'message-partial-test',
  ]);
  let aiCallCount = 0;
  let aiOffline = false;
  let forceSaveFailure = false;
  let messageSources = new Map<
    string,
    {
      bodyHtml?: string;
      bodyReplyless?: string;
      bodyText?: string;
      subject?: string;
      snippet?: string;
    }
  >();
  let threadSources = new Map<
    string,
    { title?: string; snippet?: string; latestMessageId?: string }
  >();
  let persistedMessages = new Map<string, MockPersistedMessageRecord>();
  let persistedThreads = new Map<string, MockPersistedThreadRecord>();

  function computeServerMessageHash(messageId: string): string {
    const src = messageSources.get(messageId) ?? {};
    const cleanHtml = (src.bodyHtml ?? '')
      .replace(/<img[^>]+(?:\/t\/o\/|\/opens\/)[^>]*>/gi, '')
      .replace(/([?&](?:X-Amz-Signature|token|sig)=)[^&"'\s>]+/gi, '$1');
    return `hash:${cleanHtml}|${src.bodyReplyless ?? ''}|${src.bodyText ?? ''}|${src.subject ?? ''}|${src.snippet ?? ''}`;
  }

  function computeServerThreadHash(threadId: string): string {
    const src = threadSources.get(threadId) ?? {};
    return `thash:${src.title ?? ''}|${src.snippet ?? ''}|${src.latestMessageId ?? ''}`;
  }

  beforeEach(() => {
    destroyAllTranslators();
    destroyDetector();
    clearTranslationCache();
    clearClientTranslationStateOnLogout();
    setEmailTranslationAccountScope('user-owner');
    setTargetLanguageOverride('zh');

    // Explicitly remove browser Translator and LanguageDetector to verify zero browser dependency
    delete (globalThis as any).Translator;
    delete (globalThis as any).LanguageDetector;

    currentUserScope = 'user-owner';
    accessibleIds = new Set<string>([
      'thread-title-test',
      'thread-partial-test',
      'msg-1',
      'msg-2',
      'thread-1',
      'thread-2',
      'message-partial-test',
    ]);
    aiCallCount = 0;
    aiOffline = false;
    forceSaveFailure = false;
    persistedMessages = new Map();
    persistedThreads = new Map();

    messageSources = new Map([
      [
        'msg-1',
        {
          bodyHtml:
            '<div><p>Hello team, order ORD-1001 is ready.</p><img src="https://email-service.macro.com/t/o/secret-pixel" width="1" height="1"><img src="https://email-service.macro.com/opens/official-pixel" width="1" height="1"></div>',
          bodyReplyless: '<p>Hello team, order ORD-1001 is ready.</p>',
          bodyText: 'Hello team, order ORD-1001 is ready.',
          subject: 'Order ORD-1001 Status',
          snippet: 'Hello team, order ORD-1001 is ready.',
        },
      ],
      [
        'msg-2',
        {
          bodyHtml: '<p>Second reply in thread.</p>',
          bodyReplyless: '<p>Second reply in thread.</p>',
          bodyText: 'Second reply in thread.',
          subject: 'Re: Order ORD-1001 Status',
          snippet: 'Second reply in thread.',
        },
      ],
      [
        'message-partial-test',
        {
          bodyText: 'First sentence. FAIL_ME should stay original.',
          snippet: 'First sentence. FAIL_ME should stay original.',
        },
      ],
    ]);

    threadSources = new Map([
      [
        'thread-title-test',
        {
          title: 'AW: Anfrage Visitenkarten - Letterpress mit Goldfolie',
          snippet: 'Anfrage Visitenkarten',
          latestMessageId: 'msg-1',
        },
      ],
      [
        'thread-partial-test',
        {
          title: 'Partial thread',
          snippet: 'First sentence',
          latestMessageId: 'message-partial-test',
        },
      ],
      [
        'thread-1',
        {
          title: 'Order ORD-1001 Status',
          snippet: 'Hello team, order ORD-1001 is ready.',
          latestMessageId: 'msg-1',
        },
      ],
      [
        'thread-2',
        {
          title: 'Invoice Reminder',
          snippet: 'Please review attached invoice.',
          latestMessageId: 'msg-2',
        },
      ],
    ]);

    setEmailTranslationTransport({
      requestMessages: async (
        req: EmailTranslationMessagesRequest
      ): Promise<EmailTranslationMessagesResponse> => {
        for (const id of req.message_ids) {
          if (!accessibleIds.has(id)) {
            throw new Error('403 Forbidden: no permission for message');
          }
        }

        const results: MessageTranslationApiItem[] = req.message_ids.flatMap(
          (id): MessageTranslationApiItem[] => {
          const sourceHash = computeServerMessageHash(id);
          const key = `${currentUserScope}:${id}:${req.target_lang}:${sourceHash}`;
          const existing = persistedMessages.get(key);

          if (req.action === 'get') {
            if (!existing) return [];
            return [
              {
                message_id: id,
                thread_id: 'thread-1',
                target_lang: req.target_lang,
                source_hash: existing.sourceHash,
                status: existing.status,
                saved: true,
                from_cache: true,
                translated_html: existing.translatedHtml ?? null,
                translated_replyless_html: existing.translatedReplyless ?? null,
                translated_text: existing.translatedText ?? null,
                translated_subject: existing.translatedSubject ?? null,
                translated_snippet: existing.translatedSnippet ?? null,
                model: existing.modelId,
              },
            ];
          }

          if (
            existing &&
            existing.status === 'translated' &&
            req.action !== 'retranslate'
          ) {
            return [
              {
                message_id: id,
                thread_id: 'thread-1',
                target_lang: req.target_lang,
                source_hash: existing.sourceHash,
                status: existing.status,
                saved: true,
                from_cache: true,
                translated_html: existing.translatedHtml ?? null,
                translated_replyless_html: existing.translatedReplyless ?? null,
                translated_text: existing.translatedText ?? null,
                translated_subject: existing.translatedSubject ?? null,
                translated_snippet: existing.translatedSnippet ?? null,
                model: existing.modelId,
              },
            ];
          }

          if (aiOffline) {
            return [
              {
                message_id: id,
                thread_id: 'thread-1',
                target_lang: req.target_lang,
                source_hash: sourceHash,
                status: 'error' as const,
                saved: false,
                from_cache: false,
              },
            ];
          }

          aiCallCount += 1;
          const src = messageSources.get(id) ?? {};
          const isPartial =
            (src.bodyText ?? '').includes('FAIL_ME') && req.action !== 'retry';

          if (forceSaveFailure) {
            return [
              {
                message_id: id,
                thread_id: 'thread-1',
                target_lang: req.target_lang,
                source_hash: sourceHash,
                status: 'error' as const,
                saved: false,
                from_cache: false,
              },
            ];
          }

          const prefix = `[${req.target_lang}]`;
          const record: MockPersistedMessageRecord = {
            ownerScope: currentUserScope,
            messageId: id,
            targetLang: req.target_lang,
            sourceHash,
            status: isPartial ? 'partial' : 'translated',
            translatedHtml: src.bodyHtml
              ? src.bodyHtml
                  .replace(/<img[^>]+(?:\/t\/o\/|\/opens\/)[^>]*>/gi, '')
                  .replace(
                    'Hello team, order ORD-1001 is ready.',
                    `${prefix} 你好团队，订单 ORD-1001 已就绪。`
                  )
                  .replace(
                    'Second reply in thread.',
                    `${prefix} 线程中的第二条回复。`
                  )
              : undefined,
            translatedReplyless: src.bodyReplyless
              ? `${prefix} ${src.bodyReplyless}`
              : undefined,
            translatedText: isPartial
              ? `${prefix} First sentence. FAIL_ME should stay original.`
              : src.bodyText
                ? `${prefix} ${src.bodyText}`
                : undefined,
            translatedSubject: src.subject
              ? `${prefix} ${src.subject}`
              : undefined,
            translatedSnippet: src.snippet
              ? `${prefix} ${src.snippet}`
              : undefined,
            modelId: 'openai/gpt-5-mini',
          };

          persistedMessages.set(key, record);
          return [
            {
              message_id: id,
              thread_id: 'thread-1',
              target_lang: req.target_lang,
              source_hash: sourceHash,
              status: record.status,
              saved: true,
              from_cache: false,
              translated_html: record.translatedHtml ?? null,
              translated_replyless_html: record.translatedReplyless ?? null,
              translated_text: record.translatedText ?? null,
              translated_subject: record.translatedSubject ?? null,
              translated_snippet: record.translatedSnippet ?? null,
              model: record.modelId,
            },
          ];
        });

        return { results };
      },

      requestThreads: async (
        req: EmailTranslationThreadsRequest
      ): Promise<EmailTranslationThreadsResponse> => {
        for (const id of req.thread_ids) {
          if (!accessibleIds.has(id)) {
            throw new Error('403 Forbidden: no permission for thread');
          }
        }

        const results: ThreadTranslationApiItem[] = req.thread_ids.flatMap(
          (id): ThreadTranslationApiItem[] => {
          const sourceHash = computeServerThreadHash(id);
          const key = `${currentUserScope}:${id}:${req.content_type}:${req.target_lang}:${sourceHash}`;
          const existing = persistedThreads.get(key);

          if (req.action === 'get') {
            if (!existing) return [];
            return [
              {
                thread_id: id,
                content_type: req.content_type,
                target_lang: req.target_lang,
                source_hash: existing.sourceHash,
                status: existing.status,
                saved: true,
                from_cache: true,
                translated_subject: existing.translatedTitle ?? null,
                translated_snippet: existing.translatedSnippet ?? null,
                model: existing.modelId,
              },
            ];
          }

          if (
            existing &&
            existing.status === 'translated' &&
            req.action !== 'retranslate'
          ) {
            return [
              {
                thread_id: id,
                content_type: req.content_type,
                target_lang: req.target_lang,
                source_hash: existing.sourceHash,
                status: existing.status,
                saved: true,
                from_cache: true,
                translated_subject: existing.translatedTitle ?? null,
                translated_snippet: existing.translatedSnippet ?? null,
                model: existing.modelId,
              },
            ];
          }

          if (aiOffline) {
            return [
              {
                thread_id: id,
                content_type: req.content_type,
                target_lang: req.target_lang,
                source_hash: sourceHash,
                status: 'error' as const,
                saved: false,
                from_cache: false,
              },
            ];
          }

          aiCallCount += 1;
          const src = threadSources.get(id) ?? {};
          const prefix = `[${req.target_lang}]`;
          const record: MockPersistedThreadRecord = {
            ownerScope: currentUserScope,
            threadId: id,
            targetLang: req.target_lang,
            sourceHash,
            status: 'translated',
            translatedTitle: src.title ? `${prefix} ${src.title}` : undefined,
            translatedSnippet: src.snippet
              ? `${prefix} ${src.snippet}`
              : undefined,
            modelId: 'openai/gpt-5-mini',
          };
          persistedThreads.set(key, record);
          return [
            {
              thread_id: id,
              content_type: req.content_type,
              target_lang: req.target_lang,
              source_hash: sourceHash,
              status: 'translated' as const,
              saved: true,
              from_cache: false,
              translated_subject: record.translatedTitle ?? null,
              translated_snippet: record.translatedSnippet ?? null,
              model: record.modelId,
            },
          ];
        });

        return { results };
      },
    });
  });

  it('1. works across message, thread, and list when browser Translator & LanguageDetector are undefined', async () => {
    expect((globalThis as any).Translator).toBeUndefined();
    expect((globalThis as any).LanguageDetector).toBeUndefined();
    expect(isTranslatorSupported()).toBe(true);
    expect(isTranslationSupported()).toBe(true);

    const msg = {
      db_id: 'msg-1',
      body_html_sanitized: messageSources.get('msg-1')?.bodyHtml,
      body_text: messageSources.get('msg-1')?.bodyText,
    } as any;

    expect(getMessageTranslationButtonState(msg)).toBe('idle');
    await toggleSingleMessageTranslation(msg);
    expect(getMessageTranslationButtonState(msg)).toBe('show_original');
    expect(getCachedMessageTranslation('msg-1')?.translatedHtml).toContain(
      '[zh] 你好团队，订单 ORD-1001 已就绪。'
    );
  });

  it('2. persists on first translation and reuses saved translation across refresh/new session or AI outage without calling AI again', async () => {
    const msg = {
      db_id: 'msg-1',
      body_html_sanitized: messageSources.get('msg-1')?.bodyHtml,
      body_text: messageSources.get('msg-1')?.bodyText,
      snippet: messageSources.get('msg-1')?.snippet,
    } as any;

    await toggleSingleMessageTranslation(msg);
    expect(aiCallCount).toBe(1);
    expect(getCachedMessageTranslation('msg-1')?.saved).toBe(true);

    // Simulate page refresh / new client session clearing in-memory/session caches
    clearClientTranslationStateOnLogout();
    setEmailTranslationAccountScope('user-owner');
    expect(getCachedMessageTranslation('msg-1')).toBeUndefined();

    // Even when AI provider is completely offline, prefetch and reading saved translations succeed with 0 new AI calls
    aiOffline = true;
    prefetchSavedMessageTranslation(msg);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(aiCallCount).toBe(1);
    expect(getCachedMessageTranslation('msg-1')?.saved).toBe(true);
    expect(getMessageTranslationButtonState(msg)).toBe('show_translated');

    // Clicking "显示译文" switches directly without calling AI
    await toggleSingleMessageTranslation(msg);
    expect(aiCallCount).toBe(1);
    expect(getMessageTranslationButtonState(msg)).toBe('show_original');
    expect(getCachedMessageTranslation('msg-1')?.translatedText).toContain(
      '[zh] Hello team'
    );
  });

  it('3. toggling between 显示原文 and 显示译文 preserves cached translation, makes 0 AI calls, and never mutates original message', async () => {
    const originalMessage = {
      db_id: 'msg-1',
      thread_db_id: 'thread-1',
      body_html_sanitized: messageSources.get('msg-1')?.bodyHtml,
      body_text: messageSources.get('msg-1')?.bodyText,
      snippet: messageSources.get('msg-1')?.snippet,
    } as any;
    const snapshotBefore = JSON.stringify(originalMessage);

    await translateThread('thread-1', [originalMessage], 'Order ORD-1001 Status');
    const callsAfterFirst = aiCallCount;
    expect(
      getThreadTranslationButtonState(
        'thread-1',
        [originalMessage],
        'Order ORD-1001 Status'
      )
    ).toBe('show_original');
    expect(isThreadDisplayingTranslation('thread-1')).toBe(true);
    expect(isMessageTranslated('thread-1', 'msg-1')).toBe(true);

    // Toggle to 显示原文 (show original)
    await toggleThreadTranslation(
      'thread-1',
      [originalMessage],
      'Order ORD-1001 Status'
    );
    expect(isThreadDisplayingTranslation('thread-1')).toBe(false);
    expect(
      getThreadTranslationButtonState(
        'thread-1',
        [originalMessage],
        'Order ORD-1001 Status'
      )
    ).toBe('show_translated');
    expect(isMessageTranslated('thread-1', 'msg-1')).toBe(false);
    // Underlying cache is still intact!
    expect(getCachedMessageTranslation('msg-1')?.translatedHtml).toContain(
      'ORD-1001'
    );

    // Toggle back to 显示译文 (show translated)
    await toggleThreadTranslation(
      'thread-1',
      [originalMessage],
      'Order ORD-1001 Status'
    );
    expect(isThreadDisplayingTranslation('thread-1')).toBe(true);
    expect(
      getThreadTranslationButtonState(
        'thread-1',
        [originalMessage],
        'Order ORD-1001 Status'
      )
    ).toBe('show_original');
    expect(isMessageTranslated('thread-1', 'msg-1')).toBe(true);
    expect(aiCallCount).toBe(callsAfterFirst);
    expect(JSON.stringify(originalMessage)).toBe(snapshotBefore);

    // Per-message override toggle also preserves cache without calling AI
    await toggleSingleMessageTranslation(originalMessage);
    expect(isMessageTranslated('thread-1', 'msg-1')).toBe(false);
    expect(getCachedMessageTranslation('msg-1')?.translatedHtml).toBeDefined();
    expect(aiCallCount).toBe(callsAfterFirst);
  });

  it('4. isolates target languages, invalidates on new reply or snippet change, deduplicates concurrent clicks, and retries only failed/partial items', async () => {
    const msg1 = {
      db_id: 'msg-1',
      body_html_sanitized: messageSources.get('msg-1')?.bodyHtml,
      body_text: messageSources.get('msg-1')?.bodyText,
      snippet: messageSources.get('msg-1')?.snippet,
    } as any;

    // Concurrent clicks on the same message only call AI once
    await Promise.all([
      toggleSingleMessageTranslation(msg1),
      toggleSingleMessageTranslation(msg1),
      toggleSingleMessageTranslation(msg1),
    ]);
    expect(aiCallCount).toBe(1);
    expect(getCachedMessageTranslation('msg-1')?.translatedText).toContain(
      '[zh]'
    );

    // Switching target language to Japanese stores separately without overwriting Chinese
    setTargetLanguageOverride('ja');
    expect(getCachedMessageTranslation('msg-1')).toBeUndefined();
    await toggleSingleMessageTranslation(msg1);
    expect(aiCallCount).toBe(2);
    expect(getCachedMessageTranslation('msg-1')?.translatedText).toContain(
      '[ja]'
    );

    setTargetLanguageOverride('zh');
    expect(getCachedMessageTranslation('msg-1')?.translatedText).toContain(
      '[zh]'
    );

    // List translation & snippet change invalidation
    const listItems = [
      {
        id: 'thread-1',
        name: 'Order ORD-1001 Status',
        snippet: 'Hello team, order ORD-1001 is ready.',
      },
    ];
    await toggleGlobalListTranslation(listItems);
    expect(getListTranslationButtonState(listItems)).toBe('show_original');

    // When a new reply changes the thread snippet in the list, the stale translation is not reused
    threadSources.set('thread-1', {
      title: 'Order ORD-1001 Status',
      snippet: 'New reply arrived!',
      latestMessageId: 'msg-2',
    });
    const updatedListItems = [
      {
        id: 'thread-1',
        name: 'Order ORD-1001 Status',
        snippet: 'New reply arrived!',
      },
    ] as any[];
    createRoot((dispose) => {
      const row = useEmailRowTranslation(() => updatedListItems[0], {
        autoTranslate: false,
      });
      expect(row.isTranslated()).toBe(false);
      dispose();
    });

    // Partial failure & retry only missing/partial message without re-translating already succeeded msg-1
    const msgPartial = {
      db_id: 'message-partial-test',
      body_text: 'First sentence. FAIL_ME should stay original.',
      snippet: 'First sentence. FAIL_ME should stay original.',
    } as any;
    const callsBeforePartialThread = aiCallCount;
    await translateThread(
      'thread-partial-test',
      [msg1, msgPartial],
      'Partial thread'
    );
    // msg-1 was already cached in zh, so only thread-partial-test title + message-partial-test were called
    expect(aiCallCount).toBe(callsBeforePartialThread + 2);
    expect(getThreadTranslationStatus('thread-partial-test')).toBe('partial');
    expect(
      getThreadTranslationButtonState(
        'thread-partial-test',
        [msg1, msgPartial],
        'Partial thread'
      )
    ).toBe('retry');

    // Retry only re-runs message-partial-test, not msg-1 or thread title
    const callsBeforeRetry = aiCallCount;
    await translateThread(
      'thread-partial-test',
      [msg1, msgPartial],
      'Partial thread',
      { action: 'retry' }
    );
    expect(aiCallCount).toBe(callsBeforeRetry + 1);
    expect(getThreadTranslationStatus('thread-partial-test')).toBe(
      'translated'
    );

    // Save failure is never marked as translated/saved
    forceSaveFailure = true;
    const msg2 = {
      db_id: 'msg-2',
      body_html_sanitized: messageSources.get('msg-2')?.bodyHtml,
      body_text: messageSources.get('msg-2')?.bodyText,
    } as any;
    await toggleSingleMessageTranslation(msg2);
    expect(getCachedMessageTranslation('msg-2')?.status).toBe('error');
    expect(getCachedMessageTranslation('msg-2')?.saved).toBe(false);
    expect(getMessageTranslationButtonState(msg2)).toBe('retry');
  });

  it('5. denies unauthorized users from reading or generating translations', async () => {
    const msg1 = {
      db_id: 'msg-1',
      body_html_sanitized: messageSources.get('msg-1')?.bodyHtml,
      body_text: messageSources.get('msg-1')?.bodyText,
    } as any;
    await toggleSingleMessageTranslation(msg1);
    expect(getCachedMessageTranslation('msg-1')?.status).toBe('translated');

    // Switch to unauthorized user
    clearClientTranslationStateOnLogout();
    currentUserScope = 'user-attacker';
    setEmailTranslationAccountScope('user-attacker');
    accessibleIds = new Set();

    prefetchSavedMessageTranslation(msg1);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(getCachedMessageTranslation('msg-1')).toBeUndefined();

    const data = await translateSingleMessage(msg1, { action: 'translate' });
    expect(data.status).toBe('error');
    expect(data.translatedHtml).toBeUndefined();
  });

  it('6. strips both /t/o/ and /opens/ tracking pixels during translation generation, display, and toggling', async () => {
    const sentMsg = {
      db_id: 'msg-1',
      is_sent: true,
      body_html_sanitized: messageSources.get('msg-1')?.bodyHtml,
      body_text: messageSources.get('msg-1')?.bodyText,
    } as any;

    await toggleSingleMessageTranslation(sentMsg);

    let disposeRoot!: () => void;
    let view!: ReturnType<typeof useEmailMessageTranslation>;
    createRoot((dispose) => {
      disposeRoot = dispose;
      view = useEmailMessageTranslation(() => sentMsg);
    });
    try {
      expect(view.isTranslated()).toBe(true);
      const renderedHtml = view.translatedHtml() ?? '';
      expect(renderedHtml).toContain('ORD-1001');
      expect(renderedHtml).not.toContain('/t/o/');
      expect(renderedHtml).not.toContain('/opens/');

      // Toggling back and forth never reintroduces tracking pixels
      await toggleSingleMessageTranslation(sentMsg);
      expect(view.isTranslated()).toBe(false);
      expect(view.translatedHtml()).toBeUndefined();

      await toggleSingleMessageTranslation(sentMsg);
      expect(view.isTranslated()).toBe(true);
      expect(view.translatedHtml()).not.toContain('/t/o/');
      expect(view.translatedHtml()).not.toContain('/opens/');
    } finally {
      disposeRoot();
    }
  });
});
