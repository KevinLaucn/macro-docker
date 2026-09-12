import {
  clearThreadTranslation,
  emailTranslationEnabled,
  getThreadTranslationStatus,
} from './emailTranslationState';
import type { TranslatableMessage } from './translateMessage';
import { translateThread } from './translateThread';
import { isTranslationSupported } from './translatorClient';

export function createEmailThreadTranslationHandler(options: {
  threadId: () => string;
  title?: string;
  messages: () => TranslatableMessage[];
}): () => boolean {
  return () => {
    const threadId = options.threadId();
    const messages = options.messages();
    if (
      !emailTranslationEnabled() ||
      !isTranslationSupported() ||
      !messages.length ||
      getThreadTranslationStatus(threadId) === 'loading'
    ) {
      return false;
    }

    const ids = messages
      .map((message) => message.db_id)
      .filter((id): id is string => Boolean(id));
    if (getThreadTranslationStatus(threadId) === 'translated') {
      clearThreadTranslation(threadId, ids);
    } else {
      void translateThread(threadId, messages, options.title);
    }
    return true;
  };
}
