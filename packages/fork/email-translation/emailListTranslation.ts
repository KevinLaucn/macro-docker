import type { EmailEntity } from '@entity';
import { type Accessor, createEffect } from 'solid-js';
import {
  clearAllRowTranslations,
  emailTranslationEnabled,
  getRowTranslation,
  isEmailListTranslated,
  isEmailListTranslating,
  toggleGlobalListTranslation,
  toggleRowTranslation,
} from './emailTranslationState';
import { isTranslationSupported } from './translatorClient';

export function useEmailRowTranslation(
  entity: Accessor<EmailEntity>,
  options: { autoTranslate?: boolean } = {}
) {
  const rowTranslation = () => getRowTranslation(entity().id);
  const isTranslated = () =>
    isEmailListTranslated() && rowTranslation()?.status === 'translated';

  if (options.autoTranslate) {
    createEffect(() => {
      if (
        emailTranslationEnabled() &&
        isTranslationSupported() &&
        isEmailListTranslated() &&
        !rowTranslation()
      ) {
        void toggleRowTranslation(entity().id, entity().name, entity().snippet);
      }
    });
  }

  return { rowTranslation, isTranslated };
}

export type EmailListTranslationItem = Pick<
  EmailEntity,
  'id' | 'name' | 'snippet'
>;

export function createEmailListTranslationHotkey(options: {
  currentView: Accessor<unknown>;
  emailItems: Accessor<EmailListTranslationItem[]>;
}) {
  return {
    condition: () =>
      options.currentView() === 'mail' &&
      emailTranslationEnabled() &&
      isTranslationSupported() &&
      options.emailItems().length > 0 &&
      !isEmailListTranslating(),
    keyDownHandler: () => {
      if (isEmailListTranslated()) {
        clearAllRowTranslations();
      } else {
        void toggleGlobalListTranslation(options.emailItems());
      }
      return true;
    },
  };
}
