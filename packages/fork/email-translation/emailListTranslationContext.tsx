import { useUserInfo } from '@core/context/user';
import {
  createContext,
  createEffect,
  createSignal,
  type FlowComponent,
  useContext,
} from 'solid-js';
import type { EmailListTranslationItem } from './emailListTranslation';
import { setEmailTranslationAccountScope } from './emailTranslationState';

type EmailListTranslationContextValue = {
  items: () => EmailListTranslationItem[];
  setItems: (items: EmailListTranslationItem[]) => void;
};

const EmailListTranslationContext =
  createContext<EmailListTranslationContextValue>();

export const EmailListTranslationProvider: FlowComponent = (props) => {
  const [items, setItems] = createSignal<EmailListTranslationItem[]>([]);

  try {
    const userInfo = useUserInfo();
    createEffect(() => {
      const user = userInfo();
      if (!user || !user.authenticated) {
        setEmailTranslationAccountScope(null);
        return;
      }
      const userId =
        (user as { id?: string; userId?: string }).id ??
        (user as { id?: string; userId?: string }).userId ??
        null;
      setEmailTranslationAccountScope(userId);
    });
  } catch {
    // UserContext may not be mounted in isolated unit tests.
  }

  const setItemsIfChanged = (nextItems: EmailListTranslationItem[]) => {
    setItems((previousItems) => {
      if (
        previousItems.length === nextItems.length &&
        previousItems.every(
          (item, index) =>
            item.id === nextItems[index]?.id &&
            item.name === nextItems[index]?.name &&
            item.snippet === nextItems[index]?.snippet
        )
      ) {
        return previousItems;
      }

      return nextItems;
    });
  };

  return (
    <EmailListTranslationContext.Provider
      value={{ items, setItems: setItemsIfChanged }}
    >
      {props.children}
    </EmailListTranslationContext.Provider>
  );
};

export function useEmailListTranslationContext() {
  const context = useContext(EmailListTranslationContext);
  if (!context) {
    throw new Error(
      'useEmailListTranslationContext can only be used under its provider'
    );
  }
  return context;
}

export function useMaybeEmailListTranslationContext() {
  return useContext(EmailListTranslationContext);
}
