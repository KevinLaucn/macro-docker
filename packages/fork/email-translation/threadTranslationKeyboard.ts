import { requestBrowserTranslation } from './browserTranslation';

export function createEmailThreadTranslationHandler(options: {
  threadId: () => string;
  title?: string;
  messages: () => unknown[];
}): () => boolean {
  return () => {
    const threadId = options.threadId();
    const messages = options.messages();
    if (!threadId || !messages.length) return false;
    requestBrowserTranslation();
    return true;
  };
}
