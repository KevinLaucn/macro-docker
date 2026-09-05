import type { DateValue } from '@core/util/date';
import { locale } from '@macro/i18n';

export function formatFullDate(date: DateValue): string {
  const currentLocale = locale() === 'zh-CN' ? 'zh-CN' : 'en-US';
  return new Date(date)
    .toLocaleString(currentLocale, {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short',
    })
    .replace(',', '');
}

export function formatShortDate(date: DateValue): string {
  const d = new Date(date);
  const currentLocale = locale() === 'zh-CN' ? 'zh-CN' : 'en-US';
  if (d.getFullYear() !== new Date().getFullYear()) {
    return d.toLocaleDateString(currentLocale, {
      month: 'numeric',
      day: 'numeric',
      year: '2-digit',
    });
  }
  return d.toLocaleDateString(currentLocale, {
    month: 'short',
    day: 'numeric',
  });
}
