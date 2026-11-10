import { stripOwnTrackingPixelsFromHtml } from '@macro/fork-read-receipts/utils';
import { createSignal } from 'solid-js';
import { createStore, reconcile } from 'solid-js/store';
import { translateTextDetailed } from './translateText';
import {
  clearTranslationCache,
  setTranslationCacheScope,
} from './translationCache';
import {
  emailTranslationClient,
  getEmailTranslationTransport,
  getTargetLanguage,
  hasBrowserTranslatorMock,
} from './translatorClient';
import type {
  EmailTranslationButtonState,
  MessageTranslationData,
  MessageTranslationOverride,
  RowTranslationData,
  ThreadTitleTranslationData,
  TranslationAction,
  TranslationStatus,
} from './types';

const STORAGE_KEY = 'macro.emailTranslation.enabled';

function loadStoredEnabled(): boolean {
  if (typeof window === 'undefined' || !window.localStorage) return true;
  try {
    const item = window.localStorage.getItem(STORAGE_KEY);
    return item !== null ? item === 'true' : true;
  } catch {
    return true;
  }
}

// 0. Account scope & in-flight deduplication
const [accountScope, setAccountScopeSignal] = createSignal<string>('default');
const inflightRequests = new Map<string, Promise<unknown>>();

export function getEmailTranslationAccountScope(): string {
  return accountScope();
}

export function runDeduplicatedTranslationTask<T>(
  key: string,
  task: () => Promise<T>
): Promise<T> {
  const scopedKey = `${accountScope()}:${key}`;
  const existing = inflightRequests.get(scopedKey) as Promise<T> | undefined;
  if (existing) {
    return existing;
  }
  const promise = task().finally(() => {
    inflightRequests.delete(scopedKey);
  });
  inflightRequests.set(scopedKey, promise);
  return promise;
}

function makeScopedKey(id: string, targetLang?: string): string {
  const lang = targetLang || getTargetLanguage();
  return `${accountScope()}:${lang}:${id}`;
}

/**
 * Normalizes HTML/text before computing a client-side source fingerprint so that:
 * - read status, labels, updated_at are ignored;
 * - tracking pixels (/t/o/ and /opens/) are stripped;
 * - ephemeral presigned URL query parameters are stripped.
 */
export function normalizeSourceForFingerprint(raw: string | null | undefined): string {
  if (!raw) return '';
  let cleaned = stripOwnTrackingPixelsFromHtml(String(raw));
  cleaned = cleaned.replace(
    /https?:\/\/[^\s"'<>)+]+/gi,
    (urlStr) => {
      try {
        const u = new URL(urlStr);
        const ephemeralParams = [
          'x-amz-algorithm',
          'x-amz-credential',
          'x-amz-date',
          'x-amz-expires',
          'x-amz-signedheaders',
          'x-amz-signature',
          'x-amz-security-token',
          'signature',
          'expires',
          'token',
          'sig',
        ];
        for (const k of Array.from(u.searchParams.keys())) {
          if (ephemeralParams.includes(k.toLowerCase())) {
            u.searchParams.delete(k);
          }
        }
        return u.toString();
      } catch {
        return urlStr;
      }
    }
  );
  return cleaned.replace(/\s+/g, ' ').trim();
}

export function computeMessageSourceFingerprint(message: {
  body_html_sanitized?: string | null;
  body_replyless?: string | null;
  body_macro?: string | null;
  body_text?: string | null;
}): string {
  const html = normalizeSourceForFingerprint(message.body_html_sanitized);
  const replyless = normalizeSourceForFingerprint(message.body_replyless);
  const macro = normalizeSourceForFingerprint(message.body_macro);
  const text = normalizeSourceForFingerprint(message.body_text);
  return `m|${html}|${replyless}|${macro}|${text}`;
}

export function computeRowSourceFingerprint(
  name?: string | null,
  snippet?: string | null
): string {
  const normName = normalizeSourceForFingerprint(name);
  const normSnippet = normalizeSourceForFingerprint(snippet);
  return `r|${normName}|${normSnippet}`;
}

// 1. Feature switch
const [isEmailTranslationEnabled, setEnabledSignal] = createSignal<boolean>(
  loadStoredEnabled()
);

export function emailTranslationEnabled(): boolean {
  return isEmailTranslationEnabled();
}

export function setEmailTranslationEnabled(enabled: boolean): void {
  setEnabledSignal(enabled);
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.setItem(STORAGE_KEY, String(enabled));
    } catch (e) {
      console.warn('[EmailTranslation] Failed to save setting:', e);
    }
  }
}

// 2. List row translation state
const [rowTranslations, setRowTranslations] = createStore<
  Record<string, RowTranslationData>
>({});

// 2.1 Global list translation display state (separated from cached rowTranslations)
const [isListTranslated, setListTranslated] = createSignal<boolean>(false);
const [isListTranslating, setListTranslating] = createSignal<boolean>(false);

export function isEmailListTranslated(): boolean {
  return isListTranslated();
}

export function setEmailListTranslated(translated: boolean): void {
  setListTranslated(translated);
}

export function isEmailListTranslating(): boolean {
  return isListTranslating();
}

export function clearAllRowTranslations(): void {
  setRowTranslations(reconcile({}));
  setListTranslated(false);
}

export function getRowTranslation(
  threadId: string,
  expectedName?: string,
  expectedSnippet?: string,
  targetLang?: string
): RowTranslationData | undefined {
  const key = makeScopedKey(threadId, targetLang);
  const entry = rowTranslations[key];
  if (!entry) return undefined;
  if (
    (expectedName !== undefined || expectedSnippet !== undefined) &&
    entry.sourceFingerprint
  ) {
    const currentFp = computeRowSourceFingerprint(expectedName, expectedSnippet);
    if (entry.sourceFingerprint !== currentFp) {
      return undefined;
    }
  }
  return entry;
}

export function setRowTranslation(
  threadId: string,
  data: RowTranslationData,
  targetLang?: string
): void {
  const lang = targetLang || data.targetLang || getTargetLanguage();
  const key = makeScopedKey(threadId, lang);
  setRowTranslations(key, {
    ...data,
    targetLang: lang,
  });
}

function shouldUseBackendForThread(): boolean {
  if (getEmailTranslationTransport()) return true;
  if (hasBrowserTranslatorMock()) return false;
  return true;
}

export async function translateRowItem(
  threadId: string,
  name?: string,
  snippet?: string,
  action: TranslationAction = 'translate',
  targetLang?: string
): Promise<RowTranslationData> {
  const lang = targetLang || getTargetLanguage();
  const fp = computeRowSourceFingerprint(name, snippet);
  const existing = getRowTranslation(threadId, name, snippet, lang);
  if (
    action === 'translate' &&
    existing &&
    existing.status === 'translated' &&
    existing.sourceFingerprint === fp
  ) {
    return existing;
  }

  return await runDeduplicatedTranslationTask(
    `row:${threadId}:${lang}:${action}:${fp}`,
    async () => {
      setRowTranslation(
        threadId,
        {
          status: 'loading',
          sourceFingerprint: fp,
          targetLang: lang,
        },
        lang
      );

      try {
        if (shouldUseBackendForThread()) {
          const response = await emailTranslationClient.requestThreads({
            thread_ids: [threadId],
            content_type: 'thread_summary',
            target_lang: lang,
            action,
          });
          const item = response.results.find((r) => r.thread_id === threadId);
          if (item && (item.status === 'translated' || item.status === 'partial')) {
            const nextData: RowTranslationData = {
              status: item.status,
              translatedName: item.translated_subject ?? name,
              translatedSnippet: item.translated_snippet ?? snippet,
              sourceHash: item.source_hash,
              sourceFingerprint: fp,
              targetLang: lang,
              saved: Boolean(item.saved),
              fromCache: Boolean(item.from_cache),
              model: item.model,
            };
            setRowTranslation(threadId, nextData, lang);
            return nextData;
          }
          if (item && item.status === 'none' && action === 'get') {
            const idleData: RowTranslationData = {
              status: 'idle',
              sourceFingerprint: fp,
              targetLang: lang,
            };
            setRowTranslation(threadId, idleData, lang);
            return idleData;
          }
          throw new Error('Thread summary translation was not completed');
        }

        const [translatedName, translatedSnippet] = await Promise.all([
          name
            ? translateTextDetailed(name, { targetLang: lang })
            : Promise.resolve(undefined),
          snippet
            ? translateTextDetailed(snippet, { targetLang: lang })
            : Promise.resolve(undefined),
        ]);

        const nextData: RowTranslationData = {
          status:
            translatedName?.partial || translatedSnippet?.partial
              ? 'partial'
              : 'translated',
          translatedName: translatedName?.text ?? name,
          translatedSnippet: translatedSnippet?.text ?? snippet,
          sourceFingerprint: fp,
          targetLang: lang,
          saved: true,
        };
        setRowTranslation(threadId, nextData, lang);
        return nextData;
      } catch (err) {
        console.error(
          `[EmailTranslation] Failed to translate row ${threadId}:`,
          err
        );
        const errData: RowTranslationData = {
          status: 'error',
          sourceFingerprint: fp,
          targetLang: lang,
          saved: false,
          errorMessage: err instanceof Error ? err.message : String(err),
        };
        setRowTranslation(threadId, errData, lang);
        return errData;
      }
    }
  );
}

export async function toggleRowTranslation(
  threadId: string,
  name?: string,
  snippet?: string
): Promise<void> {
  const current = getRowTranslation(threadId, name, snippet);
  if (current?.status === 'translated' && isListTranslated()) {
    return;
  }
  const action: TranslationAction =
    current?.status === 'error' || current?.status === 'partial'
      ? 'retry'
      : 'translate';
  await translateRowItem(threadId, name, snippet, action);
}

export function getListTranslationButtonState(
  items: Array<{ id: string; name?: string; snippet?: string }>
): EmailTranslationButtonState {
  if (isListTranslating()) return 'loading';
  if (items.length === 0) return 'idle';

  const rowStates = items.map((item) =>
    getRowTranslation(item.id, item.name, item.snippet)
  );
  const anyErrorOrPartial = rowStates.some(
    (r) => r?.status === 'error' || r?.status === 'partial'
  );
  if (anyErrorOrPartial) {
    return 'retry';
  }

  const allTranslated =
    rowStates.length > 0 &&
    rowStates.every((r) => r?.status === 'translated');

  if (isListTranslated() && allTranslated) {
    return 'show_original';
  }
  if (!isListTranslated() && allTranslated) {
    return 'show_translated';
  }
  if (isListTranslated()) {
    return 'show_original';
  }
  return 'idle';
}

export async function toggleGlobalListTranslation(
  items: Array<{ id: string; name?: string; snippet?: string }>
): Promise<void> {
  const btnState = getListTranslationButtonState(items);

  if (btnState === 'show_original') {
    // 仅改变显示模式为原文，绝不清空已经取得的 rowTranslations 缓存
    setListTranslated(false);
    return;
  }

  if (btnState === 'show_translated') {
    // 所有当前列表项已有匹配译文缓存，直接切换显示译文，不请求 AI
    setListTranslated(true);
    return;
  }

  const action: TranslationAction = btnState === 'retry' ? 'retry' : 'translate';

  setListTranslating(true);
  setListTranslated(true);

  try {
    const batchSize = 10;
    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      await Promise.all(
        batch.map((item) => {
          const current = getRowTranslation(item.id, item.name, item.snippet);
          if (current?.status === 'translated') {
            return Promise.resolve();
          }
          const itemAction: TranslationAction =
            current?.status === 'error' || current?.status === 'partial'
              ? 'retry'
              : action;
          return translateRowItem(
            item.id,
            item.name,
            item.snippet,
            itemAction
          );
        })
      );
    }
  } finally {
    setListTranslating(false);
  }
}

// 3. Thread-level state (separated into data status and display mode)
const THREAD_STATUS_PREFIX = 'macro.trans.thread.';
const THREAD_MODE_PREFIX = 'macro.trans.thmode.';

function readSessionThreadStatus(key: string): TranslationStatus | undefined {
  if (typeof window === 'undefined' || !window.sessionStorage) return undefined;
  try {
    const val = window.sessionStorage.getItem(THREAD_STATUS_PREFIX + key);
    return val as TranslationStatus | undefined;
  } catch {
    return undefined;
  }
}

function writeSessionThreadStatus(key: string, status: TranslationStatus): void {
  if (typeof window === 'undefined' || !window.sessionStorage) return;
  try {
    window.sessionStorage.setItem(THREAD_STATUS_PREFIX + key, status);
  } catch {}
}

function readSessionThreadMode(key: string): boolean | undefined {
  if (typeof window === 'undefined' || !window.sessionStorage) return undefined;
  try {
    const val = window.sessionStorage.getItem(THREAD_MODE_PREFIX + key);
    return val !== null ? val === 'true' : undefined;
  } catch {
    return undefined;
  }
}

function writeSessionThreadMode(key: string, mode: boolean): void {
  if (typeof window === 'undefined' || !window.sessionStorage) return;
  try {
    window.sessionStorage.setItem(THREAD_MODE_PREFIX + key, String(mode));
  } catch {}
}

const [threadStatuses, setThreadStatuses] = createStore<
  Record<string, TranslationStatus>
>({});
const [threadDisplayModes, setThreadDisplayModes] = createStore<
  Record<string, boolean>
>({});
const [threadTitleTranslations, setThreadTitleTranslations] = createStore<
  Record<string, ThreadTitleTranslationData>
>({});

export function getThreadTranslationStatus(
  threadId: string,
  targetLang?: string
): TranslationStatus {
  const key = makeScopedKey(threadId, targetLang);
  const mem = threadStatuses[key];
  if (mem !== undefined) return mem;
  const stored = readSessionThreadStatus(key);
  if (stored !== undefined) {
    setThreadStatuses(key, stored);
    return stored;
  }
  return 'idle';
}

export function setThreadTranslationStatus(
  threadId: string,
  status: TranslationStatus,
  targetLang?: string
): void {
  const key = makeScopedKey(threadId, targetLang);
  setThreadStatuses(key, status);
  writeSessionThreadStatus(key, status);
  if (status === 'translated' || status === 'partial') {
    setThreadDisplayModes(key, true);
    writeSessionThreadMode(key, true);
  } else if (status === 'idle') {
    setThreadDisplayModes(key, false);
    writeSessionThreadMode(key, false);
  }
}

export function isThreadDisplayingTranslation(
  threadId: string,
  targetLang?: string
): boolean {
  const key = makeScopedKey(threadId, targetLang);
  const status = getThreadTranslationStatus(threadId, targetLang);
  if (threadDisplayModes[key] !== undefined) {
    return Boolean(threadDisplayModes[key]);
  }
  const storedMode = readSessionThreadMode(key);
  if (storedMode !== undefined) {
    setThreadDisplayModes(key, storedMode);
    return storedMode;
  }
  return status === 'translated' || status === 'partial';
}

export function setThreadDisplayingTranslation(
  threadId: string,
  showTranslated: boolean,
  messageIds: string[] = [],
  targetLang?: string
): void {
  const key = makeScopedKey(threadId, targetLang);
  setThreadDisplayModes(key, showTranslated);
  writeSessionThreadMode(key, showTranslated);
  for (const mid of messageIds) {
    setMessageOverride(mid, showTranslated ? 'inherit' : 'original', targetLang);
  }
}

export function getThreadTitleTranslation(
  threadId: string,
  targetLang?: string
): ThreadTitleTranslationData | undefined {
  const key = makeScopedKey(threadId, targetLang);
  return threadTitleTranslations[key];
}

export function getTranslatedThreadTitle(
  threadId: string | undefined,
  originalTitle: string | undefined
): string | undefined {
  if (!threadId || !emailTranslationEnabled()) return originalTitle;
  const status = getThreadTranslationStatus(threadId);
  if (status !== 'translated' && status !== 'partial') return originalTitle;
  if (!isThreadDisplayingTranslation(threadId)) return originalTitle;
  const titleData = getThreadTitleTranslation(threadId);
  if (
    originalTitle !== undefined &&
    titleData?.sourceFingerprint &&
    titleData.sourceFingerprint !== normalizeSourceForFingerprint(originalTitle)
  ) {
    return originalTitle;
  }
  return titleData?.translatedTitle ?? originalTitle;
}

export function setThreadTitleTranslation(
  threadId: string,
  data: ThreadTitleTranslationData,
  targetLang?: string
): void {
  const lang = targetLang || data.targetLang || getTargetLanguage();
  const key = makeScopedKey(threadId, lang);
  setThreadTitleTranslations(key, {
    ...data,
    targetLang: lang,
  });
}

// 4. Message-level override: 'inherit' | 'translated' | 'original'
const MSG_OVERRIDE_PREFIX = 'macro.trans.override.';
const MSG_BODY_CACHE_PREFIX = 'macro.trans.msgbody.';

function readSessionOverride(key: string): MessageTranslationOverride | undefined {
  if (typeof window === 'undefined' || !window.sessionStorage) return undefined;
  try {
    const val = window.sessionStorage.getItem(MSG_OVERRIDE_PREFIX + key);
    return val as MessageTranslationOverride | undefined;
  } catch {
    return undefined;
  }
}

function writeSessionOverride(key: string, override: MessageTranslationOverride): void {
  if (typeof window === 'undefined' || !window.sessionStorage) return;
  try {
    window.sessionStorage.setItem(MSG_OVERRIDE_PREFIX + key, override);
  } catch {}
}

const [messageOverrides, setMessageOverrides] = createStore<
  Record<string, MessageTranslationOverride>
>({});

export function getMessageOverride(
  messageId: string,
  targetLang?: string
): MessageTranslationOverride {
  const key = makeScopedKey(messageId, targetLang);
  const mem = messageOverrides[key];
  if (mem !== undefined) return mem;
  const stored = readSessionOverride(key);
  if (stored !== undefined) {
    setMessageOverrides(key, stored);
    return stored;
  }
  return 'inherit';
}

export function setMessageOverride(
  messageId: string,
  override: MessageTranslationOverride,
  targetLang?: string
): void {
  const key = makeScopedKey(messageId, targetLang);
  setMessageOverrides(key, override);
  writeSessionOverride(key, override);
}

// 5. Message body translation cache (persisted data cache separated from view display state)
function readSessionMessageBody(key: string): MessageTranslationData | undefined {
  if (typeof window === 'undefined' || !window.sessionStorage) return undefined;
  try {
    const raw = window.sessionStorage.getItem(MSG_BODY_CACHE_PREFIX + key);
    if (!raw) return undefined;
    return JSON.parse(raw) as MessageTranslationData;
  } catch {
    return undefined;
  }
}

function writeSessionMessageBody(key: string, data: MessageTranslationData): void {
  if (typeof window === 'undefined' || !window.sessionStorage) return;
  try {
    if (data.status === 'translated' || data.status === 'partial') {
      window.sessionStorage.setItem(MSG_BODY_CACHE_PREFIX + key, JSON.stringify(data));
    }
  } catch {}
}

const [cachedMessageBodies, setCachedMessageBodies] = createStore<
  Record<string, MessageTranslationData>
>({});

export function getCachedMessageTranslation(
  messageId: string | undefined | null,
  targetLang?: string,
  expectedSourceFingerprint?: string
): MessageTranslationData | undefined {
  if (!messageId) return undefined;
  const key = makeScopedKey(messageId, targetLang);
  let entry = cachedMessageBodies[key];
  if (!entry) {
    const stored = readSessionMessageBody(key);
    if (stored) {
      setCachedMessageBodies(key, stored);
      entry = stored;
    }
  }
  if (!entry) return undefined;
  if (
    expectedSourceFingerprint &&
    entry.sourceFingerprint &&
    entry.sourceFingerprint !== expectedSourceFingerprint
  ) {
    return undefined;
  }
  return entry;
}

export function setCachedMessageTranslation(
  messageId: string,
  data: MessageTranslationData,
  targetLang?: string
): void {
  const lang = targetLang || data.targetLang || getTargetLanguage();
  const key = makeScopedKey(messageId, lang);
  setCachedMessageBodies(key, {
    ...data,
    targetLang: lang,
  });
  writeSessionMessageBody(key, {
    ...data,
    targetLang: lang,
  });
}

// 6. Evaluated message translation display state
export function isMessageTranslated(
  threadId: string | undefined | null,
  messageId: string | undefined | null,
  targetLang?: string
): boolean {
  if (!messageId) return false;
  const override = getMessageOverride(messageId, targetLang);
  if (override === 'original') return false;
  if (override === 'translated') return true;
  if (!threadId) return false;
  const threadStatus = getThreadTranslationStatus(threadId, targetLang);
  if (threadStatus !== 'translated' && threadStatus !== 'partial') return false;
  return isThreadDisplayingTranslation(threadId, targetLang);
}

export function getMessageTranslationButtonState(
  message: {
    db_id?: string | null;
    thread_db_id?: string | null;
    body_html_sanitized?: string | null;
    body_replyless?: string | null;
    body_macro?: string | null;
    body_text?: string | null;
  },
  targetLang?: string
): EmailTranslationButtonState {
  const mid = message.db_id;
  if (!mid) return 'idle';
  const fp = computeMessageSourceFingerprint(message);
  const cached = getCachedMessageTranslation(mid, targetLang, fp);
  if (cached?.status === 'loading') return 'loading';
  if (cached?.status === 'error' || cached?.status === 'partial') return 'retry';
  const displaying = isMessageTranslated(message.thread_db_id, mid, targetLang);
  if (cached?.status === 'translated') {
    return displaying ? 'show_original' : 'show_translated';
  }
  return 'idle';
}

// 7. Clear/reset thread state & message overrides
export function clearThreadTranslation(
  threadId: string,
  messageIds: string[] = [],
  targetLang?: string
): void {
  const key = makeScopedKey(threadId, targetLang);
  setThreadStatuses(key, 'idle');
  setThreadDisplayModes(key, false);
  setThreadTitleTranslations(key, { status: 'idle' });
  writeSessionThreadStatus(key, 'idle');
  writeSessionThreadMode(key, false);
  for (const mid of messageIds) {
    setMessageOverride(mid, 'inherit', targetLang);
  }
}

/**
 * Switches account scope or logs out: clears all client-side caches and display states
 * while leaving server-side PostgreSQL translations intact.
 */
export function setEmailTranslationAccountScope(
  nextScope: string | undefined | null
): void {
  const normalized = nextScope?.trim().toLowerCase() || 'default';
  if (normalized === accountScope()) return;
  const prev = accountScope();
  setAccountScopeSignal(normalized);
  setTranslationCacheScope(normalized);
  if (prev !== 'default') {
    clearClientTranslationStateOnLogout();
  }
}

export function clearClientTranslationStateOnLogout(): void {
  inflightRequests.clear();
  setRowTranslations(reconcile({}));
  setThreadStatuses(reconcile({}));
  setThreadDisplayModes(reconcile({}));
  setThreadTitleTranslations(reconcile({}));
  setMessageOverrides(reconcile({}));
  setCachedMessageBodies(reconcile({}));
  setListTranslated(false);
  setListTranslating(false);
  clearTranslationCache();
  if (typeof window !== 'undefined' && window.sessionStorage) {
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < window.sessionStorage.length; i++) {
        const k = window.sessionStorage.key(i);
        if (k?.startsWith('macro.trans.')) {
          keysToRemove.push(k);
        }
      }
      for (const k of keysToRemove) {
        window.sessionStorage.removeItem(k);
      }
    } catch {}
  }
}
