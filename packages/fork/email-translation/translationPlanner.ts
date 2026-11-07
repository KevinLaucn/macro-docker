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
  type ProtectedSpan,
  restoreProtectedSpans,
} from './tokenProtection';
import { getCachedText, setCachedText } from './translationCache';
import {
  type BatchSegmentInput,
  getTargetLanguage,
  translateSegmentsBatch,
} from './translatorClient';

export interface PlanOptions {
  targetLang?: string;
  concurrency?: number;
  signal?: AbortSignal;
  onlySegmentIds?: Set<string>;
}

export interface HtmlTranslationResult {
  html: string;
  partial: boolean;
  missingSegmentIds?: string[];
}

/**
 * Per-unit translation job — each job corresponds to exactly one TextNode.
 */
interface TranslationJob {
  unit: TranslationUnit;
  block: SemanticBlock;
  /** Language runs detected within this single TextNode's text */
  runs: Array<{
    segmentId: string;
    text: string;
    start: number;
    end: number;
    sourceLang: string;
    decision: 'KEEP' | 'TRANSLATE' | 'PROTECTED';
    confidence: number;
  }>;
}

interface PendingRunDescriptor {
  segmentId: string;
  blockId: string;
  unitId: string;
  originalText: string;
  protectedText: string;
  sourceLang: string;
  spanMap: Map<string, ProtectedSpan>;
}

export async function planAndTranslateHtmlDetailed(
  html: string,
  options?: PlanOptions
): Promise<HtmlTranslationResult> {
  if (!html || !html.trim()) return { html, partial: false };

  const targetLang = options?.targetLang || getTargetLanguage();
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

      for (let runIdx = 0; runIdx < langRuns.length; runIdx++) {
        const run = langRuns[runIdx]!;
        if (run.decision === 'TRANSLATE') {
          hasTranslatable = true;
        }
        if (run.detectedLang && run.detectedLang !== 'und') {
          rollingContextLang = run.detectedLang;
        }
        jobRuns.push({
          segmentId: `${unit.unitId}-r${runIdx}`,
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

  // 2. Collect uncached translatable segments into a contextual batch with stable segment IDs
  const pendingBySegmentId = new Map<string, PendingRunDescriptor>();
  const batchInputs: BatchSegmentInput[] = [];
  const resolvedRuns = new Map<string, string>();
  const missingSegmentIds: string[] = [];
  let partial = false;

  for (const job of jobs) {
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
        resolvedRuns.set(run.segmentId, run.text);
        continue;
      }

      const cached = getCachedText(
        run.text.trim(),
        run.sourceLang,
        targetLang
      );
      if (
        cached !== undefined &&
        (!options?.onlySegmentIds || !options.onlySegmentIds.has(run.segmentId))
      ) {
        logTranslationDebug({
          blockId: job.block.blockId,
          segmentId: job.unit.unitId,
          originalText: run.text,
          detectedLanguage: run.sourceLang,
          decision: 'TRANSLATE',
          translatorPair: `${run.sourceLang}->${targetLang}`,
          translatedText: cached,
        });
        resolvedRuns.set(run.segmentId, cached);
        continue;
      }

      const { protectedText, spanMap } = detectProtectedSpans(run.text);
      const descriptor: PendingRunDescriptor = {
        segmentId: run.segmentId,
        blockId: job.block.blockId,
        unitId: job.unit.unitId,
        originalText: run.text,
        protectedText,
        sourceLang: run.sourceLang,
        spanMap,
      };
      pendingBySegmentId.set(run.segmentId, descriptor);
      batchInputs.push({
        id: run.segmentId,
        text: protectedText,
        sourceLang: run.sourceLang,
      });
    }
  }

  if (batchInputs.length > 0 && !signal?.aborted) {
    const { translations, failedIds } = await translateSegmentsBatch(
      batchInputs,
      targetLang
    );

    for (const [segId, descriptor] of pendingBySegmentId.entries()) {
      if (failedIds.has(segId) || !translations.has(segId)) {
        partial = true;
        missingSegmentIds.push(segId);
        resolvedRuns.set(segId, descriptor.originalText);
        continue;
      }

      const rawTranslated = translations.get(segId)!;
      const restored = restoreProtectedSpans(
        rawTranslated,
        descriptor.originalText,
        descriptor.spanMap
      );

      logTranslationDebug({
        blockId: descriptor.blockId,
        segmentId: descriptor.unitId,
        originalText: descriptor.originalText,
        detectedLanguage: descriptor.sourceLang,
        decision: 'TRANSLATE',
        translatorPair: `${descriptor.sourceLang}->${targetLang}`,
        translatedText: restored,
      });

      setCachedText(
        descriptor.originalText.trim(),
        descriptor.sourceLang,
        targetLang,
        restored
      );
      resolvedRuns.set(segId, restored);
    }
  }

  if (signal?.aborted) {
    return { html, partial: false };
  }

  // 3. Node-exact writeback by stable segment IDs
  for (const job of jobs) {
    const translatedParts = job.runs.map(
      (run) => resolvedRuns.get(run.segmentId) ?? run.text
    );
    job.unit.node.nodeValue = translatedParts.join('');
  }

  return {
    html: doc.body.innerHTML,
    partial,
    missingSegmentIds: missingSegmentIds.length > 0 ? missingSegmentIds : undefined,
  };
}

export async function planAndTranslateHtml(
  html: string,
  options?: PlanOptions
): Promise<string> {
  return (await planAndTranslateHtmlDetailed(html, options)).html;
}
