import { SERVER_HOSTS } from '@core/constant/servers';
import { fetchWithToken } from '@core/util/fetchWithToken';
import { throwOnErr } from '@core/util/result';
import { locale } from '@macro/i18n';
import type {
  MessageTranslationApiItem,
  ThreadTranslationApiItem,
  TranslationAction,
} from './types';

const translatorPool = new Map<string, any>();
const pendingCreations = new Map<string, Promise<any>>();

export interface EmailTranslationMessagesRequest {
  message_ids: string[];
  target_lang: string;
  action: TranslationAction;
  link_id?: string;
}

export interface EmailTranslationMessagesResponse {
  results: MessageTranslationApiItem[];
}

export interface EmailTranslationThreadsRequest {
  thread_ids: string[];
  content_type: 'thread_title' | 'thread_summary';
  target_lang: string;
  action: TranslationAction;
  link_id?: string;
}

export interface EmailTranslationThreadsResponse {
  results: ThreadTranslationApiItem[];
}

export interface EmailTranslationTransport {
  requestMessages(
    req: EmailTranslationMessagesRequest
  ): Promise<EmailTranslationMessagesResponse>;
  requestThreads(
    req: EmailTranslationThreadsRequest
  ): Promise<EmailTranslationThreadsResponse>;
}

export interface BatchSegmentInput {
  id: string;
  text: string;
  sourceLang: string;
}

export type BatchSegmentTranslator = (
  segments: BatchSegmentInput[],
  targetLanguage: string
) => Promise<Record<string, string>>;

let customTransport: EmailTranslationTransport | null = null;
let customBatchTranslator: BatchSegmentTranslator | null = null;

export function setEmailTranslationTransport(
  transport: EmailTranslationTransport | null
): void {
  customTransport = transport;
}

export function getEmailTranslationTransport(): EmailTranslationTransport | null {
  return customTransport;
}

export function setBatchSegmentTranslator(
  translator: BatchSegmentTranslator | null
): void {
  customBatchTranslator = translator;
}

function getCognitionHost(): string {
  return SERVER_HOSTS['cognition-service'] || '/cognition';
}

export const emailTranslationClient: EmailTranslationTransport = {
  async requestMessages(
    req: EmailTranslationMessagesRequest
  ): Promise<EmailTranslationMessagesResponse> {
    if (customTransport) {
      return await customTransport.requestMessages(req);
    }
    return await throwOnErr(() =>
      fetchWithToken<EmailTranslationMessagesResponse>(
        `${getCognitionHost()}/email-translation/messages`,
        {
          method: 'POST',
          headers: req.link_id ? { 'X-Email-Link-Id': req.link_id } : undefined,
          body: JSON.stringify(req),
        }
      )
    );
  },

  async requestThreads(
    req: EmailTranslationThreadsRequest
  ): Promise<EmailTranslationThreadsResponse> {
    if (customTransport) {
      return await customTransport.requestThreads(req);
    }
    return await throwOnErr(() =>
      fetchWithToken<ThreadTranslationApiResponseCompat>(
        `${getCognitionHost()}/email-translation/threads`,
        {
          method: 'POST',
          headers: req.link_id ? { 'X-Email-Link-Id': req.link_id } : undefined,
          body: JSON.stringify(req),
        }
      )
    );
  },
};

type ThreadTranslationApiResponseCompat = EmailTranslationThreadsResponse;

/**
 * AI email translation is always supported through the unified backend ModelRouter,
 * regardless of whether the browser implements `globalThis.Translator`.
 */
export function isTranslatorSupported(): boolean {
  return true;
}

export function isTranslationSupported(): boolean {
  return true;
}

export function hasBrowserTranslatorMock(): boolean {
  return (
    typeof globalThis !== 'undefined' &&
    'Translator' in globalThis &&
    Boolean((globalThis as any).Translator)
  );
}

/**
 * Normalizes language codes so that 'zh-CN', 'zh-Hans' both map to standard targets.
 */
export function normalizeTargetLanguage(lang?: string): string {
  const current = lang || (typeof locale === 'function' ? locale() : 'zh-CN');
  if (current.toLowerCase().startsWith('zh')) {
    return 'zh';
  }
  return current.toLowerCase().split('-')[0] || 'en';
}

let targetLanguageOverride: string | null = null;

export function setTargetLanguageOverride(lang: string | null): void {
  targetLanguageOverride = lang ? normalizeTargetLanguage(lang) : null;
}

export function getTargetLanguage(): string {
  if (targetLanguageOverride) {
    return targetLanguageOverride;
  }
  return normalizeTargetLanguage();
}

/**
 * Checks model availability for a specific language pair.
 * Always returns 'readily' for unified AI translation.
 */
export async function checkAvailability(
  sourceLanguage: string,
  targetLanguage: string
): Promise<string> {
  if (
    typeof globalThis !== 'undefined' &&
    'Translator' in globalThis &&
    (globalThis as any).Translator &&
    typeof (globalThis as any).Translator.availability === 'function'
  ) {
    try {
      return await (globalThis as any).Translator.availability({
        sourceLanguage,
        targetLanguage,
      });
    } catch {
      return 'readily';
    }
  }
  return 'readily';
}

export function invalidateTranslator(
  sourceLanguage: string,
  targetLanguage: string
): void {
  const key = `${sourceLanguage}->${targetLanguage}`;
  const instance = translatorPool.get(key);
  if (instance && typeof instance.destroy === 'function') {
    try {
      instance.destroy();
    } catch {
      // Ignore cleanup error
    }
  }
  translatorPool.delete(key);
  pendingCreations.delete(key);
}

export function destroyAllTranslators(): void {
  for (const [_key, instance] of translatorPool.entries()) {
    if (instance && typeof instance.destroy === 'function') {
      try {
        instance.destroy();
      } catch {
        // Ignore
      }
    }
  }
  translatorPool.clear();
  pendingCreations.clear();
  customTransport = null;
  customBatchTranslator = null;
  targetLanguageOverride = null;
}

export async function getTranslator(
  sourceLanguage: string,
  targetLanguage: string
): Promise<any> {
  const key = `${sourceLanguage}->${targetLanguage}`;
  const existing = translatorPool.get(key);
  if (existing) {
    return existing;
  }

  const pending = pendingCreations.get(key);
  if (pending) {
    return await pending;
  }

  const creationPromise = (async () => {
    let translator: any = null;
    try {
      if ('Translator' in globalThis && (globalThis as any).Translator) {
        translator = await (globalThis as any).Translator.create({
          sourceLanguage,
          targetLanguage,
        });
      }
    } catch (err) {
      console.error(
        `[EmailTranslation] Failed to create translator for ${key}:`,
        err
      );
      throw err;
    } finally {
      pendingCreations.delete(key);
    }

    if (translator) {
      translatorPool.set(key, translator);
    }

    return translator;
  })();

  pendingCreations.set(key, creationPromise);
  return await creationPromise;
}

export async function translateRawText(
  text: string,
  sourceLanguage: string,
  targetLanguage: string
): Promise<string> {
  if (!text || !text.trim()) return text;
  if (sourceLanguage === targetLanguage) return text;

  if (customBatchTranslator) {
    const out = await customBatchTranslator(
      [{ id: 'u0', text, sourceLang: sourceLanguage }],
      targetLanguage
    );
    if (typeof out.u0 === 'string') {
      return out.u0;
    }
    throw new Error('Batch segment translator did not return segment u0');
  }

  let translator = await getTranslator(sourceLanguage, targetLanguage);
  if (!translator || typeof translator.translate !== 'function') {
    throw new Error(
      'Translator instance unavailable or missing translate method'
    );
  }

  try {
    return await translator.translate(text);
  } catch (err) {
    console.warn(
      `[EmailTranslation] Translator failed for ${sourceLanguage}->${targetLanguage}, retrying with fresh instance:`,
      err
    );
    invalidateTranslator(sourceLanguage, targetLanguage);
    translator = await getTranslator(sourceLanguage, targetLanguage);
    return await translator.translate(text);
  }
}

/**
 * Contextual segmented batch translation with stable segment IDs (`u0`, `u1`, ...).
 * Avoids per-node network requests when using AI batch translation while preserving
 * full backward compatibility with per-language translator mocks in DOM unit tests.
 */
export async function translateSegmentsBatch(
  segments: BatchSegmentInput[],
  targetLanguage: string
): Promise<{
  translations: Map<string, string>;
  failedIds: Set<string>;
}> {
  const translations = new Map<string, string>();
  const failedIds = new Set<string>();
  if (segments.length === 0) {
    return { translations, failedIds };
  }

  if (customBatchTranslator) {
    try {
      const response = await customBatchTranslator(segments, targetLanguage);
      for (const seg of segments) {
        const val = response[seg.id];
        if (typeof val === 'string' && val.trim().length > 0) {
          translations.set(seg.id, val);
        } else {
          failedIds.add(seg.id);
        }
      }
      return { translations, failedIds };
    } catch {
      for (const seg of segments) {
        failedIds.add(seg.id);
      }
      return { translations, failedIds };
    }
  }

  await Promise.all(
    segments.map(async (seg) => {
      try {
        const translated = await translateRawText(
          seg.text,
          seg.sourceLang,
          targetLanguage
        );
        translations.set(seg.id, translated);
      } catch {
        failedIds.add(seg.id);
      }
    })
  );

  return { translations, failedIds };
}
