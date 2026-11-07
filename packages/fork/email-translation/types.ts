export type TranslationStatus =
  | 'idle'
  | 'loading'
  | 'translated'
  | 'partial'
  | 'error';

export type TranslationAction = 'get' | 'translate' | 'retry' | 'retranslate';

export type EmailTranslationButtonState =
  | 'idle'
  | 'loading'
  | 'show_original'
  | 'show_translated'
  | 'retry';

export type MessageTranslationOverride = 'inherit' | 'translated' | 'original';

export interface RowTranslationData {
  status: TranslationStatus;
  translatedName?: string;
  translatedSnippet?: string;
  sourceHash?: string;
  sourceFingerprint?: string;
  targetLang?: string;
  saved?: boolean;
  fromCache?: boolean;
  model?: string | null;
  errorMessage?: string;
}

export interface MessageTranslationData {
  status: TranslationStatus;
  translatedHtml?: string;
  translatedReplylessHtml?: string;
  translatedText?: string;
  translatedSubject?: string;
  translatedSnippet?: string;
  sourceHash?: string;
  sourceFingerprint?: string;
  targetLang?: string;
  saved?: boolean;
  fromCache?: boolean;
  model?: string | null;
  missingSegmentIds?: string[];
  errorMessage?: string;
}

export interface ThreadTitleTranslationData {
  status: TranslationStatus;
  translatedTitle?: string;
  sourceHash?: string;
  sourceFingerprint?: string;
  targetLang?: string;
  saved?: boolean;
  fromCache?: boolean;
  model?: string | null;
}

export interface MessageTranslationApiItem {
  message_id: string;
  thread_id: string;
  target_lang: string;
  source_hash: string;
  status: 'none' | 'translated' | 'partial' | 'error';
  saved: boolean;
  from_cache: boolean;
  model?: string | null;
  translated_subject?: string | null;
  translated_snippet?: string | null;
  translated_html?: string | null;
  translated_replyless_html?: string | null;
  translated_text?: string | null;
}

export interface ThreadTranslationApiItem {
  thread_id: string;
  content_type: 'thread_title' | 'thread_summary';
  target_lang: string;
  source_hash: string;
  status: 'none' | 'translated' | 'partial' | 'error';
  saved: boolean;
  from_cache: boolean;
  model?: string | null;
  translated_subject?: string | null;
  translated_snippet?: string | null;
}
