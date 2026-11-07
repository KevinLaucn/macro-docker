import type { EmailEntity } from '@app/features/entity/types/entity';
import { type Accessor, createEffect } from 'solid-js';
import {
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
  const rowTranslation = () => {
    const e = entity();
    return getRowTranslation(e.id, e.name, e.snippet);
  };
  const isTranslated = () => {
    const status = rowTranslation()?.status;
    return (
      isEmailListTranslated() &&
      (status === 'translated' || status === 'partial')
    );
  };

  if (options.autoTranslate) {
    createEffect(() => {
      const e = entity();
      if (
        emailTranslationEnabled() &&
        isTranslationSupported() &&
        isEmailListTranslated() &&
        !rowTranslation()
      ) {
        void toggleRowTranslation(e.id, e.name, e.snippet);
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
      void toggleGlobalListTranslation(options.emailItems());
      return true;
    },
  };
}
