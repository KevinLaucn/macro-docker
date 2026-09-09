/**
 * DOM-aware Translation Planner
 * Orchestrates DOM segmentation, language runs, non-translatable entity protection,
 * rate-limited translation, and safe write-back using stable segment mappings.
 */

import { logTranslationDebug } from './debugLog';
import { splitLanguageRuns } from './languageRuns';
import { collectSemanticBlocks, type SemanticBlock } from './segmentation';
import { detectProtectedSpans, restoreProtectedSpans } from './tokenProtection';
import { getTargetLanguage, translateRawText } from './translatorClient';

export interface PlanOptions {
  targetLang?: string;
  concurrency?: number;
  signal?: AbortSignal;
}

/**
 * Replaces a slice of text in a block across multiple TextNodes without changing DOM hierarchy.
 */
function applyTranslatedRunToTextNodes(
  block: SemanticBlock,
  runStart: number,
  runEnd: number,
  translatedText: string
): void {
  const overlapping = block.nodeMappings.filter(
    (m) => m.start < runEnd && m.end > runStart
  );

  if (overlapping.length === 0) return;

  if (overlapping.length === 1 && overlapping[0]) {
    const m = overlapping[0];
    const nodeVal = m.node.nodeValue || '';
    const localStart = Math.max(0, runStart - m.start);
    const localEnd = Math.min(nodeVal.length, runEnd - m.start);

    const prefix = nodeVal.slice(0, localStart);
    const suffix = nodeVal.slice(localEnd);
    m.node.nodeValue = prefix + translatedText + suffix;
    return;
  }

  const first = overlapping[0];
  if (!first) return;

  const firstVal = first.node.nodeValue || '';
  const firstLocalStart = Math.max(0, runStart - first.start);
  const firstPrefix = firstVal.slice(0, firstLocalStart);
  first.node.nodeValue = firstPrefix + translatedText;

  for (let i = 1; i < overlapping.length; i++) {
    const m = overlapping[i];
    if (!m) continue;
    const nodeVal = m.node.nodeValue || '';
    if (m.end <= runEnd) {
      m.node.nodeValue = '';
    } else {
      const localEnd = runEnd - m.start;
      m.node.nodeValue = nodeVal.slice(localEnd);
    }
  }
}

export async function planAndTranslateHtml(
  html: string,
  options?: PlanOptions
): Promise<string> {
  if (!html || !html.trim()) return html;

  const targetLang = options?.targetLang || getTargetLanguage();
  const concurrency = options?.concurrency || 4;
  const signal = options?.signal;

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  const blocks = collectSemanticBlocks(doc.body);
  if (blocks.length === 0 || signal?.aborted) {
    return html;
  }

  interface TranslationJob {
    block: SemanticBlock;
    runStart: number;
    runEnd: number;
    originalText: string;
    sourceLang: string;
    segmentId: string;
  }

  const jobs: TranslationJob[] = [];

  // 1. Analyze each semantic block into language runs
  for (const block of blocks) {
    if (signal?.aborted) return html;

    const runs = await splitLanguageRuns(block.fullText, targetLang, signal);
    let runIdx = 0;

    for (const run of runs) {
      const segmentId = `${block.blockId}-run-${runIdx++}`;

      if (run.decision === 'KEEP') {
        logTranslationDebug({
          blockId: block.blockId,
          segmentId,
          originalText: run.text,
          detectedLanguage: run.detectedLang,
          confidence: run.confidence,
          decision: 'KEEP',
        });
        continue;
      }

      jobs.push({
        block,
        runStart: run.start,
        runEnd: run.end,
        originalText: run.text,
        sourceLang: run.detectedLang,
        segmentId,
      });
    }
  }

  if (jobs.length === 0 || signal?.aborted) {
    return doc.body.innerHTML;
  }

  // 2. Execute translation jobs with limited concurrency, token validation, and failure isolation
  let activeIndex = 0;

  const worker = async () => {
    while (activeIndex < jobs.length) {
      if (signal?.aborted) return;
      const currentIndex = activeIndex++;
      const job = jobs[currentIndex];
      if (!job) continue;

      // Detect non-translatable spans and generate unique placeholders ⟦P0⟧, ⟦P1⟧
      const { protectedText, spanMap } = detectProtectedSpans(job.originalText);

      try {
        const translated = await translateRawText(
          protectedText,
          job.sourceLang,
          targetLang
        );

        // Validate placeholders and restore original entities safely
        const restored = restoreProtectedSpans(
          translated,
          job.originalText,
          spanMap
        );

        logTranslationDebug({
          blockId: job.block.blockId,
          segmentId: job.segmentId,
          originalText: job.originalText,
          detectedLanguage: job.sourceLang,
          decision: 'TRANSLATE',
          translatorPair: `${job.sourceLang}->${targetLang}`,
          translatedText: restored,
        });

        // Write back safely to DOM
        applyTranslatedRunToTextNodes(
          job.block,
          job.runStart,
          job.runEnd,
          restored
        );
      } catch (err) {
        console.warn(
          `[EmailTranslation] Failed to translate segment ${job.segmentId}:`,
          err
        );
        // Failure isolation: keep original text intact
      }
    }
  };

  const pool = Array.from({ length: Math.min(concurrency, jobs.length) }, () =>
    worker()
  );
  await Promise.all(pool);

  return doc.body.innerHTML;
}
