/**
 * Plaintext Mixed-Language Translation Planner
 * Handles subjects, snippets, and plain text message bodies.
 *
 * V2: Adapted to new cache API with sourceLang parameter.
 */

import { logTranslationDebug } from './debugLog';
import { splitLanguageRuns } from './languageRuns';
import { detectProtectedSpans, restoreProtectedSpans } from './tokenProtection';
import { getCachedText, setCachedText } from './translationCache';
import { getTargetLanguage, translateRawText } from './translatorClient';

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

  // Translate each run according to its decision
  const translatedParts: string[] = [];
  let partial = false;

  for (let i = 0; i < runs.length; i++) {
    const run = runs[i];
    if (options?.signal?.aborted) return { text, partial: false };

    if (run.decision === 'KEEP') {
      logTranslationDebug({
        segmentId: `text-run-${i}`,
        originalText: run.text,
        detectedLanguage: run.detectedLang,
        confidence: run.confidence,
        decision: 'KEEP',
      });
      translatedParts.push(run.text);
      continue;
    }

    // Check cache with sourceLang included in key
    const cached = getCachedText(run.text.trim(), run.detectedLang, targetLang);
    if (cached !== undefined) {
      translatedParts.push(cached);
      continue;
    }

    // Protect non-translatable entities before sending to translator
    const { protectedText, spanMap } = detectProtectedSpans(run.text);

    try {
      const translated = await translateRawText(
        protectedText,
        run.detectedLang,
        targetLang
      );
      const restored = restoreProtectedSpans(translated, run.text, spanMap);

      logTranslationDebug({
        segmentId: `text-run-${i}`,
        originalText: run.text,
        detectedLanguage: run.detectedLang,
        confidence: run.confidence,
        decision: 'TRANSLATE',
        translatorPair: `${run.detectedLang}->${targetLang}`,
        translatedText: restored,
      });

      // Cache with sourceLang
      setCachedText(run.text.trim(), run.detectedLang, targetLang, restored);
      translatedParts.push(restored);
    } catch (err) {
      console.warn(
        `[EmailTranslation] Failed to translate text run "${run.text}":`,
        err
      );
      // Fallback: keep original text for this run
      partial = true;
      translatedParts.push(run.text);
    }
  }

  return { text: translatedParts.join(''), partial };
}

export async function planAndTranslateText(
  text: string,
  options?: TextTranslationOptions
): Promise<string> {
  return (await planAndTranslateTextDetailed(text, options)).text;
}
