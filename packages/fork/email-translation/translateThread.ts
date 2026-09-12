import {
  getCachedMessageTranslation,
  setCachedMessageTranslation,
  setMessageOverride,
  setThreadTitleTranslation,
  setThreadTranslationStatus,
} from './emailTranslationState';
import {
  type TranslatableMessage,
  translateSingleMessage,
} from './translateMessage';
import { translateTextDetailed } from './translateText';

export async function translateThread(
  threadId: string,
  messages: TranslatableMessage[],
  title?: string
): Promise<void> {
  setThreadTranslationStatus(threadId, 'loading');

  try {
    let partial = false;
    await Promise.all([
      title
        ? translateTextDetailed(title)
            .then((translatedTitle) => {
              partial ||= translatedTitle.partial;
              setThreadTitleTranslation(threadId, {
                status: translatedTitle.partial ? 'partial' : 'translated',
                translatedTitle: translatedTitle.text,
              });
            })
            .catch((err) => {
              console.error(
                `[EmailTranslation] Failed to translate thread title ${threadId}:`,
                err
              );
              partial = true;
              setThreadTitleTranslation(threadId, { status: 'error' });
            })
        : Promise.resolve(),
      ...messages.map(async (msg) => {
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
        if (translated.status === 'partial' || translated.status === 'error') {
          partial = true;
        }
        setCachedMessageTranslation(id, translated);
      }),
    ]);
    setThreadTranslationStatus(threadId, partial ? 'partial' : 'translated');
  } catch (err) {
    console.error(
      `[EmailTranslation] Failed to translate thread ${threadId}:`,
      err
    );
    setThreadTranslationStatus(threadId, 'error');
  }
}
