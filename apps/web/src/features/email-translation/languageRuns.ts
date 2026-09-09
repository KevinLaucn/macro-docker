/**
 * Mixed-language Run Detection
 * Combines Unicode Script heuristics, Intl.Segmenter, and LanguageDetector
 * to split mixed text into homogeneous language runs with explicit KEEP / TRANSLATE decisions.
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

/**
 * Splits text into logical chunks by boundary (punctuation, linebreaks, script transition).
 */
export async function splitLanguageRuns(
  text: string,
  targetLang: string,
  signal?: AbortSignal
): Promise<LanguageRun[]> {
  if (!text || !text.trim()) {
    return [];
  }

  const normTarget = normalizeLanguageCode(targetLang);

  // If text is purely CJK and target is zh, fast path: KEEP
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

  // If text has NO CJK and is entirely Latin / digits / symbols, check with detector
  if (!hasCjk(text)) {
    const detectRes = await detectLanguageWithConfidence(text);
    const detected = detectRes?.detectedLanguage
      ? normalizeLanguageCode(detectRes.detectedLanguage)
      : 'en';
    const confidence = detectRes?.confidence ?? 0.8;
    const isTarget = detected === normTarget;

    return [
      {
        text,
        start: 0,
        end: text.length,
        detectedLang: detected,
        confidence,
        decision: isTarget ? 'KEEP' : 'TRANSLATE',
      },
    ];
  }

  // Mixed text: Use sentence/punctuation segmentation to separate runs
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

  // Fallback: Split by newline or sentence punctuation if Segmenter produced 0 or 1 big segment for mixed content
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

    // Determine language of this segment
    const containsCjk = hasCjk(trimmed);
    const containsLatin = /[a-zA-Z]{2,}/.test(trimmed);

    if (containsCjk && !containsLatin) {
      // Pure CJK sentence -> matches target?
      const isTarget = normTarget === 'zh';
      runs.push({
        text: seg.text,
        start: seg.start,
        end: seg.end,
        detectedLang: 'zh',
        confidence: 1.0,
        decision: isTarget ? 'KEEP' : 'TRANSLATE',
      });
    } else if (!containsCjk && containsLatin) {
      // Pure Latin sentence -> run detector
      const res = await detectLanguageWithConfidence(trimmed);
      const detected = res?.detectedLanguage
        ? normalizeLanguageCode(res.detectedLanguage)
        : 'en';
      const isTarget = detected === normTarget;

      runs.push({
        text: seg.text,
        start: seg.start,
        end: seg.end,
        detectedLang: detected,
        confidence: res?.confidence ?? 0.85,
        decision: isTarget ? 'KEEP' : 'TRANSLATE',
      });
    } else {
      // Mixed within sentence (e.g. "系统找不到网域 test.com，因此无法将您的邮件递送至")
      // Check if CJK is dominant (> 30% of characters are CJK)
      let cjkCount = 0;
      let _latinCount = 0;
      for (const ch of trimmed) {
        if (isCjkChar(ch)) cjkCount++;
        else if (isLatinChar(ch)) _latinCount++;
      }

      if (cjkCount > 0 && normTarget === 'zh') {
        // If Chinese target and CJK is present in this segment,
        // it's a Chinese sentence with technical words or brand names (e.g. test.com, DNS)
        // We MUST NOT send the whole sentence to en->zh translator!
        // KEEP it intact.
        runs.push({
          text: seg.text,
          start: seg.start,
          end: seg.end,
          detectedLang: 'zh',
          confidence: 0.95,
          decision: 'KEEP',
        });
      } else {
        // Run detector
        const res = await detectLanguageWithConfidence(trimmed);
        const detected = res?.detectedLanguage
          ? normalizeLanguageCode(res.detectedLanguage)
          : 'en';
        const isTarget = detected === normTarget;

        runs.push({
          text: seg.text,
          start: seg.start,
          end: seg.end,
          detectedLang: detected,
          confidence: res?.confidence ?? 0.7,
          decision: isTarget ? 'KEEP' : 'TRANSLATE',
        });
      }
    }
  }

  return runs;
}
