import type { EmailListTranslationItem } from '@macro/email-translation';
import {
  createContext,
  createSignal,
  type FlowComponent,
  useContext,
} from 'solid-js';

type EmailListTranslationContextValue = {
  items: () => EmailListTranslationItem[];
  setItems: (items: EmailListTranslationItem[]) => void;
};

const EmailListTranslationContext =
  createContext<EmailListTranslationContextValue>();

export const EmailListTranslationProvider: FlowComponent = (props) => {
  const [items, setItems] = createSignal<EmailListTranslationItem[]>([]);

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
      value={{
        items,
        setItems: setItemsIfChanged,
      }}
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
