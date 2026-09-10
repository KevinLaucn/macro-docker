export type TranslationStatus = 'idle' | 'loading' | 'translated' | 'error';

export type MessageTranslationOverride = 'inherit' | 'translated' | 'original';

export interface RowTranslationData {
  status: TranslationStatus;
  translatedName?: string;
  translatedSnippet?: string;
}

export interface MessageTranslationData {
  status: TranslationStatus;
  translatedHtml?: string;
  translatedReplylessHtml?: string;
  translatedText?: string;
  translatedSnippet?: string;
}

export interface ThreadTitleTranslationData {
  status: TranslationStatus;
  translatedTitle?: string;
}
