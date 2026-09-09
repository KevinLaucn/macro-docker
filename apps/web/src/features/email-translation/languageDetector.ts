let detectorInstance: any = null;
let pendingDetectorPromise: Promise<any> | null = null;

export function isLanguageDetectorSupported(): boolean {
  if (typeof globalThis === 'undefined') return false;
  return 'LanguageDetector' in globalThis;
}

export async function getDetectorInstance(): Promise<any> {
  if (detectorInstance) return detectorInstance;
  if (pendingDetectorPromise) return await pendingDetectorPromise;

  pendingDetectorPromise = (async () => {
    try {
      if ('LanguageDetector' in globalThis) {
        detectorInstance = await (globalThis as any).LanguageDetector.create();
      }
      return detectorInstance;
    } finally {
      pendingDetectorPromise = null;
    }
  })();

  return await pendingDetectorPromise;
}

export async function detectLanguageWithConfidence(
  text: string
): Promise<{ detectedLanguage: string; confidence: number } | undefined> {
  const sample = text.trim().slice(0, 1000);
  if (!sample) return undefined;

  try {
    const detector = await getDetectorInstance();
    if (detector && typeof detector.detect === 'function') {
      const results = await detector.detect(sample);
      if (Array.isArray(results) && results.length > 0 && results[0]) {
        return {
          detectedLanguage: results[0].detectedLanguage,
          confidence:
            typeof results[0].confidence === 'number'
              ? results[0].confidence
              : 0.8,
        };
      }
    }
  } catch (err) {
    console.warn('[EmailTranslation] Failed to detect language:', err);
  }

  return undefined;
}

export async function detectLanguage(
  text: string
): Promise<string | undefined> {
  const res = await detectLanguageWithConfidence(text);
  return res?.detectedLanguage;
}

export function destroyDetector(): void {
  if (detectorInstance && typeof detectorInstance.destroy === 'function') {
    try {
      detectorInstance.destroy();
    } catch {
      // Ignore
    }
  }
  detectorInstance = null;
  pendingDetectorPromise = null;
}
