import type { ApiMessage } from '@service-email/generated/schemas';
import { translateHtml } from './translateHtml';
import { translateText } from './translateText';
import type { MessageTranslationData } from './types';

export async function translateSingleMessage(
  message: ApiMessage
): Promise<MessageTranslationData> {
  const result: MessageTranslationData = {
    status: 'translated',
  };

  try {
    if (message.body_html_sanitized) {
      // HTML email: translate DOM text nodes while keeping all HTML structure and styles
      const htmlStr = message.body_html_sanitized.toString();
      result.translatedHtml = await translateHtml(htmlStr);

      if (message.body_replyless) {
        result.translatedReplylessHtml = await translateHtml(
          message.body_replyless.toString()
        );
      }
    } else if (message.body_macro) {
      // Plaintext Macro email
      result.translatedText = await translateText(
        message.body_macro.toString()
      );
    } else if (message.body_text) {
      // Standard plaintext email
      result.translatedText = await translateText(message.body_text.toString());
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
      result.translatedSnippet = await translateText(rawSnippet);
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
