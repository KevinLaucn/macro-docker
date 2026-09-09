const MEMORY_CACHE = new Map<string, string>();
const SESSION_STORAGE_PREFIX = 'macro.trans.cache.';
const MAX_SESSION_KEYS = 500;

function getCacheKey(text: string, targetLang: string): string {
  return `${targetLang}:${text.trim()}`;
}

export function getCachedText(
  text: string,
  targetLang: string
): string | undefined {
  const key = getCacheKey(text, targetLang);
  // 1. Memory cache hit (fastest)
  const memHit = MEMORY_CACHE.get(key);
  if (memHit !== undefined) {
    return memHit;
  }

  // 2. SessionStorage cache hit
  if (typeof window !== 'undefined' && window.sessionStorage) {
    try {
      const stored = window.sessionStorage.getItem(
        SESSION_STORAGE_PREFIX + key
      );
      if (stored !== null) {
        MEMORY_CACHE.set(key, stored);
        return stored;
      }
    } catch {
      // Ignore storage access error
    }
  }

  return undefined;
}

export function setCachedText(
  text: string,
  targetLang: string,
  translated: string
): void {
  const key = getCacheKey(text, targetLang);
  MEMORY_CACHE.set(key, translated);

  if (typeof window !== 'undefined' && window.sessionStorage) {
    try {
      window.sessionStorage.setItem(SESSION_STORAGE_PREFIX + key, translated);
      // Evict oldest keys if too many
      if (window.sessionStorage.length > MAX_SESSION_KEYS) {
        for (let i = 0; i < window.sessionStorage.length; i++) {
          const k = window.sessionStorage.key(i);
          if (k?.startsWith(SESSION_STORAGE_PREFIX)) {
            window.sessionStorage.removeItem(k);
            break;
          }
        }
      }
    } catch {
      // Ignore storage quota error
    }
  }
}

export function clearTranslationCache(): void {
  MEMORY_CACHE.clear();
  if (typeof window !== 'undefined' && window.sessionStorage) {
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < window.sessionStorage.length; i++) {
        const k = window.sessionStorage.key(i);
        if (k?.startsWith(SESSION_STORAGE_PREFIX)) {
          keysToRemove.push(k);
        }
      }
      for (const k of keysToRemove) {
        window.sessionStorage.removeItem(k);
      }
    } catch {
      // Ignore
    }
  }
}
