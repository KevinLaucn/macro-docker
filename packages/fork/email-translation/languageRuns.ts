/**
 * Mixed-language Run Detection
 * Combines Unicode Script heuristics, Intl.Segmenter, and LanguageDetector
 * to split mixed text into homogeneous language runs with explicit KEEP / TRANSLATE decisions.
 *
 * V2: Fixed mixed-language bug where any CJK character caused entire segment to KEEP.
 *     Now uses proportion-based detection with context inheritance for short/ambiguous text.
 */

import { detectLanguageWithConfidence } from './languageDetector';

export interface LanguageRun {
  text: string;
  start: number;
  end: number;
  detectedLang: string;
  confidence: number;
  decision: 'KEEP' | 'TRANSLATE' | 'PROTECTED';
}

/**
 * Normalizes language codes so that 'zh-CN', 'zh', 'zh-Hans' all match as 'zh'.
 */
export function normalizeLanguageCode(code: string | undefined): string {
  if (!code) return 'und';
  const lower = code.toLowerCase().trim();
  if (lower.startsWith('zh')) return 'zh';
  if (lower.startsWith('en')) return 'en';
  if (lower.startsWith('ja')) return 'ja';
  if (lower.startsWith('ko')) return 'ko';
  if (lower.startsWith('es')) return 'es';
  if (lower.startsWith('fr')) return 'fr';
  if (lower.startsWith('de')) return 'de';
  if (lower.startsWith('ru')) return 'ru';
  return lower.split('-')[0] || lower;
}

/**
 * Checks if a character is a CJK Ideograph (Chinese/Japanese Kanji/Korean Hanja).
 */
function isCjkChar(char: string): boolean {
  const code = char.codePointAt(0);
  if (!code) return false;
  return (
    (code >= 0x4e00 && code <= 0x9fff) || // CJK Unified Ideographs
    (code >= 0x3400 && code <= 0x4dbf) || // CJK Extension A
    (code >= 0x20000 && code <= 0x2a6df) || // CJK Extension B
    (code >= 0xf900 && code <= 0xfaff) || // CJK Compatibility Ideographs
    (code >= 0x3000 && code <= 0x303f) // CJK Symbols and Punctuation
  );
}

/**
 * Checks if a character is Latin script (English, European languages).
 */
function isLatinChar(char: string): boolean {
  const code = char.codePointAt(0);
  if (!code) return false;
  return (
    (code >= 0x0041 && code <= 0x005a) || // A-Z
    (code >= 0x0061 && code <= 0x007a) || // a-z
    (code >= 0x00c0 && code <= 0x00ff) || // Latin-1 Supplement
    (code >= 0x0100 && code <= 0x017f) // Latin Extended-A
  );
}

/**
 * Checks if text contains substantial Chinese / CJK characters.
 */
export function hasCjk(text: string): boolean {
  for (const char of text) {
    if (isCjkChar(char)) return true;
  }
  return false;
}

/** CJK dominance threshold: if CJK characters make up > 70% of script characters, treat as Chinese */
const CJK_DOMINANCE_RATIO = 0.7;

const KNOWN_TRANSLATOR_SOURCE_LANGUAGES = new Set([
  'en',
  'de',
  'fr',
  'es',
  'it',
  'pt',
  'nl',
  'pl',
  'ru',
  'ja',
  'ko',
  'zh',
]);

function detectGermanEmailPhrase(text: string): boolean {
  return /\b(sehr geehrte|mit freundlichen gr[uü]ßen|anfrage|visitenkarten|goldfolie|angebot|rechnung|damen und herren)\b/i.test(
    text
  );
}

async function detectTranslatableLanguage(
  text: string,
  contextLang?: string
): Promise<{
  detected: string;
  confidence: number;
}> {
  if (detectGermanEmailPhrase(text)) {
    return { detected: 'de', confidence: 0.98 };
  }

  const res = await detectLanguageWithConfidence(text);
  const rawDetected = res?.detectedLanguage
    ? normalizeLanguageCode(res.detectedLanguage)
    : undefined;
  const confidence = res?.confidence ?? 0;

  // 'und' (undetermined) or no result → inherit context language or default to 'en'
  if (!rawDetected || rawDetected === 'und') {
    if (contextLang && contextLang !== 'und') {
      return { detected: contextLang, confidence: 0.5 };
    }
    return { detected: 'en', confidence: 0.5 };
  }

  if (!KNOWN_TRANSLATOR_SOURCE_LANGUAGES.has(rawDetected)) {
    return { detected: 'en', confidence: 0.5 };
  }

  return { detected: rawDetected, confidence };
}

/**
 * Counts CJK and Latin script characters in text, returning their counts
 * and the total number of script characters (ignoring whitespace/punctuation).
 */
function countScriptChars(text: string): {
  cjk: number;
  latin: number;
  total: number;
} {
  let cjk = 0;
  let latin = 0;
  for (const ch of text) {
    if (isCjkChar(ch)) cjk++;
    else if (isLatinChar(ch)) latin++;
  }
  return { cjk, latin, total: cjk + latin };
}

/**
 * Splits text into logical chunks by boundary (punctuation, linebreaks, script transition).
 *
 * @param contextLang Optional language inherited from surrounding context
 *   (e.g. the dominant language of the containing SemanticBlock).
 *   Used to resolve ambiguous short segments.
 */
export async function splitLanguageRuns(
  text: string,
  targetLang: string,
  signal?: AbortSignal,
  contextLang?: string
): Promise<LanguageRun[]> {
  if (!text || !text.trim()) {
    return [];
  }

  const normTarget = normalizeLanguageCode(targetLang);

  // If text is purely CJK (no Latin prose at all) and target is zh, fast path: KEEP
  if (!/[a-zA-Z]{3,}/.test(text) && hasCjk(text) && normTarget === 'zh') {
    return [
      {
        text,
        start: 0,
        end: text.length,
        detectedLang: 'zh',
        confidence: 1.0,
        decision: 'KEEP',
      },
    ];
  }

  // Use sentence/punctuation segmentation to separate runs. A single email
  // paragraph can mix Latin-script languages, e.g. English body plus German signoff.
  // We split by sentence boundaries (e.g. 。！？\n or English sentences ending with . ! ?)
  // But preserve the exact indices.
  const rawSegments: { text: string; start: number; end: number }[] = [];

  // Try Intl.Segmenter with sentence granularity if available
  if (typeof Intl !== 'undefined' && (Intl as any).Segmenter) {
    try {
      const segmenter = new (Intl as any).Segmenter(undefined, {
        granularity: 'sentence',
      });
      for (const seg of segmenter.segment(text)) {
        if (seg.segment) {
          rawSegments.push({
            text: seg.segment,
            start: seg.index,
            end: seg.index + seg.segment.length,
          });
        }
      }
    } catch {
      // Fallback below
    }
  }

  // Fallback: Split by newline or sentence punctuation if Segmenter produced 0 or 1 big segment
  if (rawSegments.length <= 1) {
    rawSegments.length = 0;
    // Regex matches CJK sentence endings, newlines, or Latin sentence endings followed by space
    const splitRegex = /([。\n\r]+|(?<=[.!?])\s+)/g;
    let lastIndex = 0;
    let match = splitRegex.exec(text);
    while (match !== null) {
      const end = match.index + match[0].length;
      const part = text.slice(lastIndex, end);
      if (part) {
        rawSegments.push({ text: part, start: lastIndex, end });
      }
      lastIndex = end;
      match = splitRegex.exec(text);
    }
    if (lastIndex < text.length) {
      rawSegments.push({
        text: text.slice(lastIndex),
        start: lastIndex,
        end: text.length,
      });
    }
  }

  const runs: LanguageRun[] = [];
  // Track the last detected language as rolling context for ambiguous segments
  let rollingContextLang = contextLang;

  for (const seg of rawSegments) {
    if (signal?.aborted) break;

    const trimmed = seg.text.trim();
    if (!trimmed) {
      // Whitespace only, keep as-is
      runs.push({
        text: seg.text,
        start: seg.start,
        end: seg.end,
        detectedLang: normTarget,
        confidence: 1.0,
        decision: 'KEEP',
      });
      continue;
    }

    // Count script characters for proportion-based detection
    const { cjk, latin, total } = countScriptChars(trimmed);

    if (total === 0) {
      // Pure punctuation/numbers/symbols → KEEP
      runs.push({
        text: seg.text,
        start: seg.start,
        end: seg.end,
        detectedLang: normTarget,
        confidence: 1.0,
        decision: 'KEEP',
      });
      continue;
    }

    if (cjk > 0 && latin === 0) {
      // Pure CJK sentence → matches target?
      const isTarget = normTarget === 'zh';
      const run: LanguageRun = {
        text: seg.text,
        start: seg.start,
        end: seg.end,
        detectedLang: 'zh',
        confidence: 1.0,
        decision: isTarget ? 'KEEP' : 'TRANSLATE',
      };
      runs.push(run);
      rollingContextLang = 'zh';
    } else if (cjk === 0 && latin > 0) {
      // Pure Latin sentence → run detector
      const { detected, confidence } = await detectTranslatableLanguage(
        trimmed,
        rollingContextLang
      );
      const isTarget = detected === normTarget;

      const run: LanguageRun = {
        text: seg.text,
        start: seg.start,
        end: seg.end,
        detectedLang: detected,
        confidence,
        decision: isTarget ? 'KEEP' : 'TRANSLATE',
      };
      runs.push(run);
      rollingContextLang = detected;
    } else {
      // Mixed CJK + Latin within sentence
      // Use proportion-based detection instead of "any CJK → KEEP"
      const cjkRatio = total > 0 ? cjk / total : 0;

      if (cjkRatio >= CJK_DOMINANCE_RATIO && normTarget === 'zh') {
        // CJK dominant (>70%) — this is a Chinese sentence with embedded
        // brand names / tech terms (e.g. "系统找不到网域 test.com")
        // KEEP intact to avoid sending Chinese to en→zh translator
        runs.push({
          text: seg.text,
          start: seg.start,
          end: seg.end,
          detectedLang: 'zh',
          confidence: 0.95,
          decision: 'KEEP',
        });
        rollingContextLang = 'zh';
      } else {
        // Latin dominant or roughly equal → run language detector
        // This handles cases like "Gift is a German word" or mixed German/English
        const { detected, confidence } = await detectTranslatableLanguage(
          trimmed,
          rollingContextLang
        );
        const isTarget = detected === normTarget;

        runs.push({
          text: seg.text,
          start: seg.start,
          end: seg.end,
          detectedLang: detected,
          confidence,
          decision: isTarget ? 'KEEP' : 'TRANSLATE',
        });
        rollingContextLang = detected;
      }
    }
  }

  return runs;
}
