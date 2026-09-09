import { createSignal } from 'solid-js';
import { createStore } from 'solid-js/store';
import { translateText } from './translateText';
import type {
  MessageTranslationData,
  MessageTranslationOverride,
  RowTranslationData,
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

// 2.1 Global list translation state
const [isListTranslated, setListTranslated] = createSignal<boolean>(false);
const [isListTranslating, setListTranslating] = createSignal<boolean>(false);

export function isEmailListTranslated(): boolean {
  return isListTranslated();
}

export function isEmailListTranslating(): boolean {
  return isListTranslating();
}

export function clearAllRowTranslations(): void {
  setRowTranslations({});
  setListTranslated(false);
}

export function getRowTranslation(
  threadId: string
): RowTranslationData | undefined {
  return rowTranslations[threadId];
}

export function setRowTranslation(
  threadId: string,
  data: RowTranslationData
): void {
  setRowTranslations(threadId, data);
}

export async function toggleRowTranslation(
  threadId: string,
  name?: string,
  snippet?: string
): Promise<void> {
  const current = rowTranslations[threadId];
  if (current?.status === 'translated') {
    // Restore original
    setRowTranslations(threadId, { status: 'idle' });
    return;
  }

  setRowTranslations(threadId, { status: 'loading' });

  try {
    const [translatedName, translatedSnippet] = await Promise.all([
      name ? translateText(name) : Promise.resolve(name),
      snippet ? translateText(snippet) : Promise.resolve(snippet),
    ]);

    setRowTranslations(threadId, {
      status: 'translated',
      translatedName,
      translatedSnippet,
    });
  } catch (err) {
    console.error(
      `[EmailTranslation] Failed to translate row ${threadId}:`,
      err
    );
    setRowTranslations(threadId, { status: 'error' });
  }
}

export async function toggleGlobalListTranslation(
  items: Array<{ id: string; name?: string; snippet?: string }>
): Promise<void> {
  if (isListTranslated()) {
    // 恢复原文：只需将全局列表翻译开关置为 false
    // 保留现有 rowTranslations 缓存，下次开启时立即可用，避免重新翻译
    setListTranslated(false);
    return;
  }

  setListTranslating(true);
  setListTranslated(true);

  try {
    const batchSize = 10;
    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      await Promise.all(
        batch.map((item) => {
          // 如果当前行已经翻译过，则无需重新请求
          const current = rowTranslations[item.id];
          if (current?.status === 'translated') {
            return Promise.resolve();
          }
          return toggleRowTranslation(item.id, item.name, item.snippet);
        })
      );
    }
  } finally {
    setListTranslating(false);
  }
}

// 3. Thread-level state
const [threadStatuses, setThreadStatuses] = createStore<
  Record<string, TranslationStatus>
>({});

export function getThreadTranslationStatus(
  threadId: string
): TranslationStatus {
  return threadStatuses[threadId] ?? 'idle';
}

export function setThreadTranslationStatus(
  threadId: string,
  status: TranslationStatus
): void {
  setThreadStatuses(threadId, status);
}

// 4. Message-level override: 'inherit' | 'translated' | 'original'
const [messageOverrides, setMessageOverrides] = createStore<
  Record<string, MessageTranslationOverride>
>({});

export function getMessageOverride(
  messageId: string
): MessageTranslationOverride {
  return messageOverrides[messageId] ?? 'inherit';
}

export function setMessageOverride(
  messageId: string,
  override: MessageTranslationOverride
): void {
  setMessageOverrides(messageId, override);
}

// 5. Message body translation cache
const [cachedMessageBodies, setCachedMessageBodies] = createStore<
  Record<string, MessageTranslationData>
>({});

export function getCachedMessageTranslation(
  messageId: string
): MessageTranslationData | undefined {
  return cachedMessageBodies[messageId];
}

export function setCachedMessageTranslation(
  messageId: string,
  data: MessageTranslationData
): void {
  setCachedMessageBodies(messageId, data);
}

// 6. Evaluated message translation state
export function isMessageTranslated(
  threadId: string,
  messageId: string
): boolean {
  const override = getMessageOverride(messageId);
  if (override === 'original') return false;
  if (override === 'translated') return true;
  return getThreadTranslationStatus(threadId) === 'translated';
}

// 7. Clear/reset thread state & message overrides
export function clearThreadTranslation(
  threadId: string,
  messageIds: string[] = []
): void {
  setThreadStatuses(threadId, 'idle');
  for (const mid of messageIds) {
    setMessageOverrides(mid, 'inherit');
  }
}
