import type { DateValue } from '@core/util/date';
import { locale } from '@macro/i18n';
import {
  differenceInHours,
  differenceInMinutes,
  format,
  isSameYear,
  isToday,
  isYesterday,
} from 'date-fns';
import { zhCN } from 'date-fns/locale';

/**
 * Formats a timestamp into a human-readable string.
 * - Today: Shows time (e.g., "2:30 PM")
 * - Same year: Shows month and day (e.g., "Jan 27" or "9月4日")
 * - Older: Shows full date (e.g., "1/27/24" or "2024/1/27")
 */
export function formatTimestamp(date: DateValue): string {
  const isZh = locale() === 'zh-CN';
  const d = typeof date === 'string' ? new Date(date) : date;

  if (isToday(d)) {
    return isZh ? format(d, 'aa h:mm', { locale: zhCN }) : format(d, 'h:mm a');
  }

  if (isSameYear(d, new Date())) {
    return isZh ? format(d, 'M月d日', { locale: zhCN }) : format(d, 'MMM d');
  }

  return isZh ? format(d, 'yyyy/M/d', { locale: zhCN }) : format(d, 'M/d/yy');
}

/**
 * Formats a timestamp into a relative human-readable string.
 * - Under 60 minutes: "X minutes ago"
 * - Under 24 hours: "X hours ago"
 * - Yesterday: "3:45pm yesterday"
 * - Older: Shows date (e.g., "Jan 27" or "1/27/24")
 */
export function formatRelativeTimestamp(
  date: DateValue,
  options?: { condensed?: boolean }
): string {
  const isZh = locale() === 'zh-CN';
  const now = new Date();
  const condensed = options?.condensed ?? false;

  const minutesAgo = differenceInMinutes(now, date);

  if (minutesAgo < 1) {
    return isZh ? '刚刚' : 'just now';
  }

  if (minutesAgo < 60) {
    if (isZh) {
      return `${minutesAgo} 分钟前`;
    }
    const unit = condensed ? 'min' : minutesAgo === 1 ? 'minute' : 'minutes';
    return `${minutesAgo} ${unit} ago`;
  }

  const hoursAgo = differenceInHours(now, date);

  if (hoursAgo < 24) {
    if (isZh) {
      return `${hoursAgo} 小时前`;
    }
    const unit = condensed ? 'hr' : hoursAgo === 1 ? 'hour' : 'hours';
    return `${hoursAgo} ${unit} ago`;
  }

  if (isYesterday(date)) {
    if (isZh) {
      return condensed ? '昨天' : `昨天 ${format(date, 'h:mma')}`;
    }
    return condensed ? 'yest' : `${format(date, 'h:mma')} yesterday`;
  }

  if (isSameYear(date, now)) {
    return isZh
      ? format(date, 'M月d日', { locale: zhCN })
      : format(date, 'MMM d');
  }

  return isZh
    ? format(date, 'yyyy/M/d', { locale: zhCN })
    : format(date, 'M/d/yy');
}

/**
 * Formats a date + time in a single concise line, e.g. "Apr 15, 2:30 PM" or
 * "1/27/24, 2:30 PM". Used when a row needs both pieces (e.g. automation
 * next-run times).
 */
export function formatDateAndTime(date: DateValue): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const dateLabel = isSameYear(d, new Date())
    ? format(d, 'MMM d')
    : format(d, 'M/d/yy');
  const timeLabel = format(d, 'h:mm a');
  return `${dateLabel}, ${timeLabel}`;
}
