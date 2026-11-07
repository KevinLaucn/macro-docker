import {
  emailTranslationEnabled,
  getThreadTranslationStatus,
} from './emailTranslationState';
import type { TranslatableMessage } from './translateMessage';
import { toggleThreadTranslation } from './translateThread';
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
      !threadId ||
      (!messages.length && !options.title) ||
      getThreadTranslationStatus(threadId) === 'loading'
    ) {
      return false;
    }

    void toggleThreadTranslation(threadId, messages, options.title);
    return true;
  };
}
