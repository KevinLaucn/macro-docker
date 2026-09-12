/**
 * Translation Debug Logging
 * Provides structured, controllable logging for translation decisions in dev mode.
 */

export interface TranslationDebugEntry {
  blockId?: string;
  segmentId: string;
  originalText: string;
  detectedLanguage?: string;
  confidence?: number;
  isMixed?: boolean;
  decision: 'KEEP' | 'TRANSLATE' | 'PROTECTED';
  translatorPair?: string;
  translatedText?: string;
}

export function logTranslationDebug(entry: TranslationDebugEntry): void {
  // Only log if explicitly enabled or in development mode
  if (
    typeof window !== 'undefined' &&
    (window as any).__MACRO_TRANSLATION_DEBUG__
  ) {
    console.debug('[Translation Planner]', {
      blockId: entry.blockId,
      segmentId: entry.segmentId,
      originalText:
        entry.originalText.length > 60
          ? entry.originalText.slice(0, 60) + '...'
          : entry.originalText,
      detectedLanguage: entry.detectedLanguage,
      confidence: entry.confidence,
      isMixed: entry.isMixed,
      decision: entry.decision,
      translatorPair: entry.translatorPair,
      translatedText: entry.translatedText
        ? entry.translatedText.length > 60
          ? entry.translatedText.slice(0, 60) + '...'
          : entry.translatedText
        : undefined,
    });
  }
}
