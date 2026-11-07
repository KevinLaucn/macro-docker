/**
 * Plaintext Mixed-Language Translation Planner
 * Handles subjects, snippets, and plain text message bodies.
 *
 * V2: Adapted to new cache API with sourceLang parameter.
 */

import { logTranslationDebug } from './debugLog';
import { splitLanguageRuns } from './languageRuns';
import {
  detectProtectedSpans,
  type ProtectedSpan,
  restoreProtectedSpans,
} from './tokenProtection';
import { getCachedText, setCachedText } from './translationCache';
import {
  type BatchSegmentInput,
  getTargetLanguage,
  translateSegmentsBatch,
} from './translatorClient';

export interface TextTranslationOptions {
  targetLang?: string;
  signal?: AbortSignal;
}

export interface TextTranslationResult {
  text: string;
  partial: boolean;
}

export async function planAndTranslateTextDetailed(
  text: string,
  options?: TextTranslationOptions
): Promise<TextTranslationResult> {
  if (!text || !text.trim()) return { text, partial: false };

  const targetLang = options?.targetLang || getTargetLanguage();

  // Split into language runs
  const runs = await splitLanguageRuns(text, targetLang, options?.signal);
  if (runs.length === 0 || options?.signal?.aborted) {
    return { text, partial: false };
  }

  // Fast path: if all runs are KEEP, return immediately without translation
  const allKeep = runs.every((r) => r.decision === 'KEEP');
  if (allKeep) {
    return { text, partial: false };
  }

  const resolvedParts = new Map<number, string>();
  const pendingMeta = new Map<
    string,
    {
      index: number;
      originalText: string;
      sourceLang: string;
      confidence: number;
      spanMap: Map<string, ProtectedSpan>;
    }
  >();
  const batchInputs: BatchSegmentInput[] = [];
  let partial = false;

  for (let i = 0; i < runs.length; i++) {
    const run = runs[i]!;
    if (options?.signal?.aborted) return { text, partial: false };

    if (run.decision === 'KEEP') {
      logTranslationDebug({
        segmentId: `text-run-${i}`,
        originalText: run.text,
        detectedLanguage: run.detectedLang,
        confidence: run.confidence,
        decision: 'KEEP',
      });
      resolvedParts.set(i, run.text);
      continue;
    }

    const cached = getCachedText(run.text.trim(), run.detectedLang, targetLang);
    if (cached !== undefined) {
      resolvedParts.set(i, cached);
      continue;
    }

    const { protectedText, spanMap } = detectProtectedSpans(run.text);
    const segId = `text-run-${i}`;
    pendingMeta.set(segId, {
      index: i,
      originalText: run.text,
      sourceLang: run.detectedLang,
      confidence: run.confidence,
      spanMap,
    });
    batchInputs.push({
      id: segId,
      text: protectedText,
      sourceLang: run.detectedLang,
    });
  }

  if (batchInputs.length > 0 && !options?.signal?.aborted) {
    const { translations, failedIds } = await translateSegmentsBatch(
      batchInputs,
      targetLang
    );

    for (const [segId, meta] of pendingMeta.entries()) {
      if (failedIds.has(segId) || !translations.has(segId)) {
        partial = true;
        resolvedParts.set(meta.index, meta.originalText);
        continue;
      }

      const translated = translations.get(segId)!;
      const restored = restoreProtectedSpans(
        translated,
        meta.originalText,
        meta.spanMap
      );

      logTranslationDebug({
        segmentId: segId,
        originalText: meta.originalText,
        detectedLanguage: meta.sourceLang,
        confidence: meta.confidence,
        decision: 'TRANSLATE',
        translatorPair: `${meta.sourceLang}->${targetLang}`,
        translatedText: restored,
      });

      setCachedText(
        meta.originalText.trim(),
        meta.sourceLang,
        targetLang,
        restored
      );
      resolvedParts.set(meta.index, restored);
    }
  }

  const translatedParts: string[] = [];
  for (let i = 0; i < runs.length; i++) {
    translatedParts.push(resolvedParts.get(i) ?? runs[i]!.text);
  }

  return { text: translatedParts.join(''), partial };
}

export async function planAndTranslateText(
  text: string,
  options?: TextTranslationOptions
): Promise<string> {
  return (await planAndTranslateTextDetailed(text, options)).text;
}
