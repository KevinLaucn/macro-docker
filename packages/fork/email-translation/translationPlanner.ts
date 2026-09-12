/**
 * DOM-aware Translation Planner (V2: Node-Addressed Writeback)
 *
 * Orchestrates DOM segmentation, per-TextNode language detection,
 * non-translatable entity protection, structural label/value protection,
 * rate-limited translation, and node-exact write-back.
 *
 * Core invariant: each TextNode is translated and written back independently.
 * SemanticBlock provides context only — never used as a cross-node writeback unit.
 */

import { logTranslationDebug } from './debugLog';
import { splitLanguageRuns } from './languageRuns';
import type { TranslationUnit } from './segmentation';
import { collectSemanticBlocks, type SemanticBlock } from './segmentation';
import {
  detectProtectedSpans,
  isStructuralValueNode,
  restoreProtectedSpans,
} from './tokenProtection';
import { getCachedText, setCachedText } from './translationCache';
import { getTargetLanguage, translateRawText } from './translatorClient';

export interface PlanOptions {
  targetLang?: string;
  concurrency?: number;
  signal?: AbortSignal;
}

export interface HtmlTranslationResult {
  html: string;
  partial: boolean;
}

/**
 * Per-unit translation job — each job corresponds to exactly one TextNode.
 */
interface TranslationJob {
  unit: TranslationUnit;
  block: SemanticBlock;
  /** Language runs detected within this single TextNode's text */
  runs: Array<{
    text: string;
    start: number;
    end: number;
    sourceLang: string;
    decision: 'KEEP' | 'TRANSLATE' | 'PROTECTED';
    confidence: number;
  }>;
}

export async function planAndTranslateHtmlDetailed(
  html: string,
  options?: PlanOptions
): Promise<HtmlTranslationResult> {
  if (!html || !html.trim()) return { html, partial: false };

  const targetLang = options?.targetLang || getTargetLanguage();
  const concurrency = options?.concurrency || 4;
  const signal = options?.signal;

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  const blocks = collectSemanticBlocks(doc.body);
  if (blocks.length === 0 || signal?.aborted) {
    return { html, partial: false };
  }

  const jobs: TranslationJob[] = [];
  let rollingContextLang: string | undefined;

  // 1. Analyze each TextNode independently within its SemanticBlock context
  for (const block of blocks) {
    if (signal?.aborted) return { html, partial: false };

    for (const unit of block.units) {
      if (signal?.aborted) return { html, partial: false };

      const text = unit.originalText;
      if (!text.trim()) continue;

      // Check structural entity protection (DOM-based label/value detection)
      if (isStructuralValueNode(unit.node)) {
        logTranslationDebug({
          blockId: block.blockId,
          segmentId: unit.unitId,
          originalText: text,
          decision: 'PROTECTED',
        });
        continue; // Skip — value of a protected label
      }

      // Split the single TextNode's text into language runs with context inheritance
      const langRuns = await splitLanguageRuns(
        text,
        targetLang,
        signal,
        rollingContextLang
      );

      const jobRuns: TranslationJob['runs'] = [];
      let hasTranslatable = false;

      for (const run of langRuns) {
        if (run.decision === 'TRANSLATE') {
          hasTranslatable = true;
        }
        if (run.detectedLang && run.detectedLang !== 'und') {
          rollingContextLang = run.detectedLang;
        }
        jobRuns.push({
          text: run.text,
          start: run.start,
          end: run.end,
          sourceLang: run.detectedLang,
          decision: run.decision,
          confidence: run.confidence,
        });
      }

      if (!hasTranslatable) {
        // All runs are KEEP — log and skip
        for (const run of jobRuns) {
          logTranslationDebug({
            blockId: block.blockId,
            segmentId: unit.unitId,
            originalText: run.text,
            detectedLanguage: run.sourceLang,
            confidence: run.confidence,
            decision: 'KEEP',
          });
        }
        continue;
      }

      jobs.push({ unit, block, runs: jobRuns });
    }
  }

  if (jobs.length === 0 || signal?.aborted) {
    return { html: doc.body.innerHTML, partial: false };
  }

  // 2. Execute translation jobs with limited concurrency
  //    Each job translates ONE TextNode and writes back to that exact node.
  let activeIndex = 0;
  let partial = false;

  const worker = async () => {
    while (activeIndex < jobs.length) {
      if (signal?.aborted) return;
      const currentIndex = activeIndex++;
      const job = jobs[currentIndex];
      if (!job) continue;

      try {
        // Build the translated text for this TextNode by processing each run
        const translatedParts: string[] = [];

        for (const run of job.runs) {
          if (run.decision === 'KEEP' || run.decision === 'PROTECTED') {
            logTranslationDebug({
              blockId: job.block.blockId,
              segmentId: job.unit.unitId,
              originalText: run.text,
              detectedLanguage: run.sourceLang,
              confidence: run.confidence,
              decision: run.decision,
            });
            translatedParts.push(run.text);
            continue;
          }

          // Check translation cache with sourceLang before calling translator
          const cached = getCachedText(
            run.text.trim(),
            run.sourceLang,
            targetLang
          );
          if (cached !== undefined) {
            logTranslationDebug({
              blockId: job.block.blockId,
              segmentId: job.unit.unitId,
              originalText: run.text,
              detectedLanguage: run.sourceLang,
              decision: 'TRANSLATE',
              translatorPair: `${run.sourceLang}->${targetLang}`,
              translatedText: cached,
            });
            translatedParts.push(cached);
            continue;
          }

          // TRANSLATE: protect entities, translate, restore
          const { protectedText, spanMap } = detectProtectedSpans(run.text);

          try {
            const translated = await translateRawText(
              protectedText,
              run.sourceLang,
              targetLang
            );

            const restored = restoreProtectedSpans(
              translated,
              run.text,
              spanMap
            );

            logTranslationDebug({
              blockId: job.block.blockId,
              segmentId: job.unit.unitId,
              originalText: run.text,
              detectedLanguage: run.sourceLang,
              decision: 'TRANSLATE',
              translatorPair: `${run.sourceLang}->${targetLang}`,
              translatedText: restored,
            });

            // Cache the translated result with sourceLang
            setCachedText(
              run.text.trim(),
              run.sourceLang,
              targetLang,
              restored
            );

            translatedParts.push(restored);
          } catch (err) {
            console.warn(
              `[EmailTranslation] Failed to translate run in ${job.unit.unitId}:`,
              err
            );
            // Failure isolation: keep original text for this run
            partial = true;
            translatedParts.push(run.text);
          }
        }

        // Node-exact writeback: only modify this TextNode's nodeValue
        job.unit.node.nodeValue = translatedParts.join('');
      } catch (err) {
        console.warn(
          `[EmailTranslation] Failed to process unit ${job.unit.unitId}:`,
          err
        );
        // Failure isolation: keep original text intact
        partial = true;
      }
    }
  };

  const pool = Array.from({ length: Math.min(concurrency, jobs.length) }, () =>
    worker()
  );
  await Promise.all(pool);

  return { html: doc.body.innerHTML, partial };
}

export async function planAndTranslateHtml(
  html: string,
  options?: PlanOptions
): Promise<string> {
  return (await planAndTranslateHtmlDetailed(html, options)).html;
}
