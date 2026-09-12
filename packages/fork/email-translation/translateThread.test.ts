// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearThreadTranslation,
  getCachedMessageTranslation,
  getThreadTitleTranslation,
  getThreadTranslationStatus,
} from './emailTranslationState';
import { destroyDetector } from './languageDetector';
import { translateThread } from './translateThread';
import { clearTranslationCache } from './translationCache';
import { destroyAllTranslators } from './translatorClient';

describe('email thread translation', () => {
  beforeEach(() => {
    destroyAllTranslators();
    destroyDetector();
    clearTranslationCache();

    (globalThis as any).LanguageDetector = {
      create: vi.fn(async () => ({
        detect: vi.fn(async () => [
          { detectedLanguage: 'de', confidence: 0.95 },
        ]),
        destroy: vi.fn(),
      })),
    };

    (globalThis as any).Translator = {
      create: vi.fn(async () => ({
        translate: vi.fn(async (text: string) => `[译] ${text}`),
        destroy: vi.fn(),
      })),
    };
  });

  it('translates and clears the thread title with the global thread action', async () => {
    const threadId = 'thread-title-test';

    await translateThread(
      threadId,
      [],
      'AW: Anfrage Visitenkarten - Letterpress mit Goldfolie'
    );

    expect(getThreadTranslationStatus(threadId)).toBe('translated');
    expect(getThreadTitleTranslation(threadId)?.translatedTitle).toContain(
      '[译]'
    );

    clearThreadTranslation(threadId);

    expect(getThreadTranslationStatus(threadId)).toBe('idle');
    expect(getThreadTitleTranslation(threadId)?.status).toBe('idle');
  });

  it('marks the thread partial when a message run falls back to original text', async () => {
    const threadId = 'thread-partial-test';

    (globalThis as any).Translator.create = vi.fn(async () => ({
      translate: vi.fn(async (text: string) => {
        if (text.includes('FAIL_ME')) {
          throw new Error('Translator crash');
        }
        return `[译] ${text}`;
      }),
      destroy: vi.fn(),
    }));

    await translateThread(threadId, [
      {
        db_id: 'message-partial-test',
        body_text: 'First sentence. FAIL_ME should stay original.',
      },
    ]);

    expect(getThreadTranslationStatus(threadId)).toBe('partial');
    expect(getCachedMessageTranslation('message-partial-test')?.status).toBe(
      'partial'
    );
    expect(
      getCachedMessageTranslation('message-partial-test')?.translatedText
    ).toContain('FAIL_ME should stay original');
  });
});
