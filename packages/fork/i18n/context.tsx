import {
  createContext,
  createEffect,
  type ParentComponent,
  useContext,
} from 'solid-js';
import {
  __t,
  formatBoolean,
  formatDate,
  formatDateTime,
  formatNumber,
  formatTime,
  type InterpolationParams,
  locale,
  type SupportedLocale,
  setLocale,
  mapOfficialLanguageToForkLocale,
  syncForkLocale,
  type TOptions,
  t,
} from './runtime';

export {
  __t,
  formatBoolean,
  formatDate,
  formatDateTime,
  formatNumber,
  formatTime,
  type InterpolationParams,
  locale,
  type SupportedLocale,
  setLocale,
  mapOfficialLanguageToForkLocale,
  syncForkLocale,
  type TOptions,
  t,
};

interface I18nContextValue {
  locale: () => SupportedLocale;
  setLocale: (l: SupportedLocale) => void;
  t: typeof t;
}

const I18nContext = createContext<I18nContextValue>({
  locale,
  setLocale,
  t,
});

export const I18nProvider: ParentComponent = (props) => {
  createEffect(() => {
    const current = locale();
    try {
      const target = current === 'zh-CN' ? 'zh-Hans' : 'en';
      if (!document.documentElement.lang || document.documentElement.lang === 'zh-CN' || document.documentElement.lang === 'en-US') {
        document.documentElement.lang = target;
      }
    } catch {
      // ignore
    }
  });

  return (
    <I18nContext.Provider value={{ locale, setLocale, t }}>
      {props.children}
    </I18nContext.Provider>
  );
};

export function useI18n() {
  return useContext(I18nContext);
}
