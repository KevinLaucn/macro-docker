import { translateHtmlDetailed } from './translateHtml';
import { translateTextDetailed } from './translateText';
import type { MessageTranslationData } from './types';

export type TranslatableMessage = {
  db_id?: string | null;
  body_html_sanitized?: string | null;
  body_replyless?: string | null;
  body_macro?: string | null;
  body_text?: string | null;
};

export async function translateSingleMessage(
  message: TranslatableMessage
): Promise<MessageTranslationData> {
  const result: MessageTranslationData = {
    status: 'translated',
  };
  let partial = false;

  try {
    if (message.body_html_sanitized) {
      // HTML email: translate DOM text nodes while keeping all HTML structure and styles
      const htmlStr = message.body_html_sanitized.toString();
      const translatedHtml = await translateHtmlDetailed(htmlStr);
      result.translatedHtml = translatedHtml.html;
      partial ||= translatedHtml.partial;

      if (message.body_replyless) {
        const translatedReplylessHtml = await translateHtmlDetailed(
          message.body_replyless.toString()
        );
        result.translatedReplylessHtml = translatedReplylessHtml.html;
        partial ||= translatedReplylessHtml.partial;
      }
    } else if (message.body_macro) {
      // Plaintext Macro email
      const translatedText = await translateTextDetailed(
        message.body_macro.toString()
      );
      result.translatedText = translatedText.text;
      partial ||= translatedText.partial;
    } else if (message.body_text) {
      // Standard plaintext email
      const translatedText = await translateTextDetailed(
        message.body_text.toString()
      );
      result.translatedText = translatedText.text;
      partial ||= translatedText.partial;
    }

    // Also translate snippet for collapsed messages / previews
    let rawSnippet = '';
    if (message.body_text) {
      rawSnippet = message.body_text.replace(/\s+/g, ' ').trim();
    } else if (message.body_html_sanitized) {
      const parser = new DOMParser();
      const doc = parser.parseFromString(
        message.body_html_sanitized.toString(),
        'text/html'
      );
      rawSnippet = doc.body.textContent?.replace(/\s+/g, ' ').trim() ?? '';
    }
    if (rawSnippet) {
      const translatedSnippet = await translateTextDetailed(rawSnippet);
      result.translatedSnippet = translatedSnippet.text;
      partial ||= translatedSnippet.partial;
    }

    if (partial) {
      result.status = 'partial';
    }

    return result;
  } catch (err) {
    console.error(
      `[EmailTranslation] Failed to translate message ${message.db_id}:`,
      err
    );
    return {
      status: 'error',
    };
  }
}
