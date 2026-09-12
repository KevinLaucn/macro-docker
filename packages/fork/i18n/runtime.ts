import { createSignal } from 'solid-js';
import zhCN from './locales/zh-CN.json';

export type SupportedLocale = 'zh-CN' | 'en-US';

const STORAGE_KEY = 'macro_locale';

function getDefaultLocale(): SupportedLocale {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'zh-CN' || saved === 'en-US') {
      return saved;
    }
    if (
      typeof navigator !== 'undefined' &&
      navigator.language?.startsWith('zh')
    ) {
      return 'zh-CN';
    }
  } catch {
    // ignore
  }
  return 'en-US';
}

export const [locale, setLocaleSignal] = createSignal<SupportedLocale>(
  getDefaultLocale()
);

export function setLocale(newLocale: SupportedLocale) {
  setLocaleSignal(newLocale);
  try {
    localStorage.setItem(STORAGE_KEY, newLocale);
    document.documentElement.lang = newLocale;
  } catch {
    // ignore
  }
}

const dictionaries: Record<SupportedLocale, Record<string, string>> = {
  'zh-CN': zhCN as Record<string, string>,
  'en-US': {},
};

export type InterpolationParams =
  | Record<string, string | number>
  | (string | number)[];

export interface TOptions {
  context?: string;
  fallback?: string;
  [key: string]: any;
}

function interpolate(template: string, params: InterpolationParams): string {
  if (!params) return template;
  if (Array.isArray(params)) {
    return template.replace(/\{(\d+)\}/g, (match, idx) => {
      const val = params[Number(idx)];
      return val !== undefined ? String(val) : match;
    });
  }
  return template.replace(/\{([a-zA-Z0-9_-]+)\}/g, (match, key) => {
    const val = (params as Record<string, string | number>)[key];
    return val !== undefined ? String(val) : match;
  });
}

function normalizeKey(str: string): string {
  return str.trim().replace(/\s+/g, ' ');
}

/**
 * Global reactive translation helper.
 * Reading locale() establishes a SolidJS reactive dependency in JSX computations.
 *
 * Supported call signatures:
 * - t("Settings")
 * - t("Delete {name}", { name: "Project" })
 * - t("Owner", { context: "crm" })
 * - t("Owner", "crm")
 * - t("Owner", { context: "crm", fallback: "Owner" })
 * - t("Hello {name}", { name: "World" }, "context")
 */
export function t(
  key: string,
  paramsOrOptionsOrContext?: InterpolationParams | TOptions | string,
  contextKeyOrFallback?: string,
  fallback?: string
): string {
  if (typeof key !== 'string' || !key) return (key as unknown as string) || '';
  const current = locale();

  let params: InterpolationParams | undefined;
  let contextKey: string | undefined;
  let finalFallback: string | undefined = fallback;

  if (typeof paramsOrOptionsOrContext === 'string') {
    contextKey = paramsOrOptionsOrContext;
    finalFallback = contextKeyOrFallback;
  } else if (
    paramsOrOptionsOrContext &&
    typeof paramsOrOptionsOrContext === 'object'
  ) {
    if (Array.isArray(paramsOrOptionsOrContext)) {
      params = paramsOrOptionsOrContext;
      contextKey = contextKeyOrFallback;
    } else {
      const opts = paramsOrOptionsOrContext as TOptions;
      if (opts.context !== undefined || opts.fallback !== undefined) {
        contextKey = opts.context;
        finalFallback = opts.fallback ?? finalFallback;
        // Check if there are other interpolation parameters inside opts
        const restParams: Record<string, string | number> = {};
        let hasRest = false;
        for (const [k, v] of Object.entries(opts)) {
          if (k !== 'context' && k !== 'fallback') {
            restParams[k] = v;
            hasRest = true;
          }
        }
        if (hasRest) params = restParams;
      } else {
        params = paramsOrOptionsOrContext as Record<string, string | number>;
        contextKey = contextKeyOrFallback;
      }
    }
  }

  if (current === 'zh-CN') {
    const dict = dictionaries['zh-CN'];
    const normalized = normalizeKey(key);

    let translatedTemplate: string | undefined;
    if (contextKey) {
      translatedTemplate =
        dict[`${key}@@${contextKey}`] || dict[`${normalized}@@${contextKey}`];
    }
    if (!translatedTemplate) {
      translatedTemplate = dict[key] || dict[normalized];
    }

    if (translatedTemplate) {
      return params
        ? interpolate(translatedTemplate, params)
        : translatedTemplate;
    }
  }

  const baseText = finalFallback ?? key;
  return params ? interpolate(baseText, params) : baseText;
}

/**
 * Backward compatibility alias for legacy AST / callers.
 */
export const __t = t;

/**
 * Locale-aware date and time formatting
 */
export function formatDate(
  date: Date | number | string,
  options: Intl.DateTimeFormatOptions = { dateStyle: 'medium' }
): string {
  const d = typeof date === 'object' ? date : new Date(date);
  const current = locale() === 'zh-CN' ? 'zh-CN' : 'en-US';
  return new Intl.DateTimeFormat(current, options).format(d);
}

export function formatTime(
  date: Date | number | string,
  options: Intl.DateTimeFormatOptions = { timeStyle: 'short' }
): string {
  const d = typeof date === 'object' ? date : new Date(date);
  const current = locale() === 'zh-CN' ? 'zh-CN' : 'en-US';
  return new Intl.DateTimeFormat(current, options).format(d);
}

export function formatDateTime(
  date: Date | number | string,
  options: Intl.DateTimeFormatOptions = {
    dateStyle: 'medium',
    timeStyle: 'short',
  }
): string {
  const d = typeof date === 'object' ? date : new Date(date);
  const current = locale() === 'zh-CN' ? 'zh-CN' : 'en-US';
  return new Intl.DateTimeFormat(current, options).format(d);
}

export function formatBoolean(value: boolean): string {
  const current = locale();
  if (current === 'zh-CN') {
    return value ? '是' : '否';
  }
  return value ? 'True' : 'False';
}

export function formatNumber(
  num: number,
  options?: Intl.NumberFormatOptions
): string {
  const current = locale() === 'zh-CN' ? 'zh-CN' : 'en-US';
  return new Intl.NumberFormat(current, options).format(num);
}

// Attach to global window for legacy or AST-injected calls
if (typeof window !== 'undefined') {
  (window as unknown as { __t: typeof t; t: typeof t }).__t = t;
  (window as unknown as { __t: typeof t; t: typeof t }).t = t;
}
