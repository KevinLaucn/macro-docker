import type { ApiMessage } from '@service-email/generated/schemas';
import {
  getCachedMessageTranslation,
  setCachedMessageTranslation,
  setMessageOverride,
  setThreadTranslationStatus,
} from './emailTranslationState';
import { translateSingleMessage } from './translateMessage';

export async function translateThread(
  threadId: string,
  messages: ApiMessage[]
): Promise<void> {
  setThreadTranslationStatus(threadId, 'loading');

  try {
    await Promise.all(
      messages.map(async (msg) => {
        if (!msg.db_id) return;
        const id = msg.db_id;
        // Reset any individual 'original' overrides so all messages participate in thread translation
        setMessageOverride(id, 'inherit');

        // Check if message is already cached as translated
        const existing = getCachedMessageTranslation(id);
        if (existing?.status === 'translated') {
          return;
        }

        setCachedMessageTranslation(id, { status: 'loading' });
        const translated = await translateSingleMessage(msg);
        setCachedMessageTranslation(id, translated);
      })
    );
    setThreadTranslationStatus(threadId, 'translated');
  } catch (err) {
    console.error(
      `[EmailTranslation] Failed to translate thread ${threadId}:`,
      err
    );
    setThreadTranslationStatus(threadId, 'error');
  }
}
