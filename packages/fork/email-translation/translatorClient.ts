import { locale } from '@macro/i18n';

const translatorPool = new Map<string, any>();
const pendingCreations = new Map<string, Promise<any>>();

export function isTranslatorSupported(): boolean {
  if (typeof globalThis === 'undefined') return false;
  return 'Translator' in globalThis;
}

export function isTranslationSupported(): boolean {
  return isTranslatorSupported();
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

export function getTargetLanguage(): string {
  return normalizeTargetLanguage();
}

/**
 * Checks model availability for a specific language pair if supported by the browser.
 */
export async function checkAvailability(
  sourceLanguage: string,
  targetLanguage: string
): Promise<string> {
  if (
    typeof globalThis !== 'undefined' &&
    'Translator' in globalThis &&
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
      if ('Translator' in globalThis) {
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

  let translator = await getTranslator(sourceLanguage, targetLanguage);
  if (!translator || typeof translator.translate !== 'function') {
    throw new Error(
      'Translator instance unavailable or missing translate method'
    );
  }

  try {
    return await translator.translate(text);
  } catch (err) {
    // Evict stale or failed instance from pool and retry once
    console.warn(
      `[EmailTranslation] Translator failed for ${sourceLanguage}->${targetLanguage}, retrying with fresh instance:`,
      err
    );
    invalidateTranslator(sourceLanguage, targetLanguage);
    translator = await getTranslator(sourceLanguage, targetLanguage);
    return await translator.translate(text);
  }
}
