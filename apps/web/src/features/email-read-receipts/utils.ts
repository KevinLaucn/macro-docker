import { locale, t } from '@macro/i18n';
import { differenceInMinutes } from 'date-fns';
import type { ReadReceiptStatusData } from './client';

export function statusSeenAt(status?: ReadReceiptStatusData): Date | undefined {
  if (!status?.open_count || !status.last_opened_at) return undefined;
  return new Date(status.last_opened_at);
}

const CHINA_TIMEZONE = 'Asia/Shanghai';

/**
 * Formats a read-receipt timestamp:
 * - Within 1 hour (< 60 minutes): "刚刚" or "X 分钟前" / "X minutes ago"
 * - 1 hour or older: 24-hour format with year, month, day hardcoded in China timezone (Asia/Shanghai), e.g. "2026年9月11日 13:47"
 */
export function formatReadReceiptTime(date: Date): string {
  const isZh = locale() === 'zh-CN';
  const now = new Date();
  const minutesAgo = differenceInMinutes(now, date);

  if (minutesAgo < 1) {
    return isZh ? '刚刚' : 'just now';
  }

  if (minutesAgo < 60) {
    if (isZh) {
      return `${minutesAgo} 分钟前`;
    }
    return minutesAgo === 1 ? '1 minute ago' : `${minutesAgo} minutes ago`;
  }

  const formatter = new Intl.DateTimeFormat('zh-CN', {
    timeZone: CHINA_TIMEZONE,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });

  const parts = formatter.formatToParts(date);
  const partMap: Record<string, string> = {};
  for (const part of parts) {
    partMap[part.type] = part.value;
  }

  const year = partMap.year ?? '';
  const month = partMap.month ?? '';
  const day = partMap.day ?? '';
  const hour = partMap.hour ?? '';
  const minute = partMap.minute ?? '';

  if (isZh) {
    return `${year}年${month}月${day}日 ${hour}:${minute}`;
  }

  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')} ${hour}:${minute}`;
}

/**
 * Format compact read-receipt status text according to specification:
 * - No status / not opened: `Not opened yet` / `尚未打开`
 * - First opened: `Opened {time}` / `{time} 已打开`
 * - Multiple opens: `Opened {time} · {count} times` / `{time} 已打开 · {count} 次`
 * - Tracking disabled: `Open tracking off` / `打开追踪已关闭`
 */
export function formatReadReceiptStatus(status?: ReadReceiptStatusData): {
  label: string;
  tooltip: string;
} {
  if (!status || status.open_count === 0 || !status.last_opened_at) {
    return {
      label: t('Not opened yet'),
      tooltip: t('Not opened yet'),
    };
  }

  const openDate = new Date(status.last_opened_at);
  const timeStr = formatReadReceiptTime(openDate);

  if (status.open_count === 1) {
    const text = t('Opened {time}', { time: timeStr });
    return {
      label: text,
      tooltip: text,
    };
  }

  const text = t('Opened {time} · {count} times', {
    time: timeStr,
    count: status.open_count,
  });

  return {
    label: text,
    tooltip: text,
  };
}

/**
 * Strips blocked tracking pixels from received email HTML while it is inert.
 *
 * MVP rules:
 * - Strip <img> elements with explicit 1x1 dimensions (or 0x0).
 * - Strip <img> elements with inline CSS forcing both dimensions to <= 1px.
 * - Strip Macro /t/o/ tracking pixels.
 * - Preserve CID images (`cid:`) and normal remote images.
 */
export function stripBlockedTrackingPixelsFromHtml(html: string): string {
  if (!html) return html;
  const template = document.createElement('template');
  template.innerHTML = html;
  const root = template.content;

  for (const img of Array.from(root.querySelectorAll('img'))) {
    const src = (img.getAttribute('src') ?? '').trim();

    // Never block CID images
    if (src.toLowerCase().startsWith('cid:')) {
      continue;
    }

    // Block Macro tracking pixels (official domains, same-origin, or configured email-service)
    // or URLs containing a standard 36-char tracking token.
    if (isMacroTrackingPixelUrl(src) || /\/t\/o\/[0-9a-fA-F-]{36}/.test(src)) {
      img.remove();
      continue;
    }

    // Check explicit attributes (e.g. width="1" height="1", width="0", width="1px")
    const widthAttr = img.getAttribute('width')?.trim();
    const heightAttr = img.getAttribute('height')?.trim();
    const isTinyDim = (val: string | undefined | null) =>
      val === '0' || val === '1' || val === '0px' || val === '1px';

    if (isTinyDim(widthAttr) && isTinyDim(heightAttr)) {
      img.remove();
      continue;
    }

    // Check inline style dimensions (e.g. style="width:1px;height:1px")
    const style = img.getAttribute('style')?.toLowerCase() ?? '';
    const hasTinyStyleWidth = /width\s*:\s*[01](?:px)?\b/.test(style);
    const hasTinyStyleHeight = /height\s*:\s*[01](?:px)?\b/.test(style);
    if (hasTinyStyleWidth && hasTinyStyleHeight) {
      img.remove();
    }
  }

  return template.innerHTML;
}

export const OPEN_TRACKING_PATH = '/t/o/';

export function isMacroTrackingPixelUrl(
  src: string,
  configuredEmailServiceUrl?: string
): boolean {
  if (!src || !src.includes(OPEN_TRACKING_PATH)) return false;
  try {
    const baseOrigin =
      typeof window !== 'undefined' ? window.location.origin : undefined;
    const url = new URL(src, baseOrigin);
    if (!url.pathname.includes(OPEN_TRACKING_PATH)) return false;

    // 1. Official Macro hosts
    if (/^email-service[a-z0-9.-]*\.macro\.com$/.test(url.hostname)) {
      return true;
    }

    // 2. Same-origin self-host
    if (baseOrigin && url.origin === baseOrigin) {
      return true;
    }

    // 3. Configured email-service origin (cross-origin self-host)
    const configuredHost =
      configuredEmailServiceUrl ?? SERVER_HOSTS['email-service'];
    if (configuredHost) {
      const configuredOrigin = new URL(configuredHost, baseOrigin).origin;
      if (url.origin === configuredOrigin) {
        return true;
      }
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * Removes Macro open-tracking pixels from a rendered sent-mail body.
 */
export function removeOwnTrackingPixels(root: ParentNode): void {
  for (const img of Array.from(root.querySelectorAll('img'))) {
    const src = img.getAttribute('src') ?? '';
    if (isMacroTrackingPixelUrl(src)) img.remove();
  }
}

/**
 * Strips Macro tracking pixels while the HTML is still inert.
 */
export function stripOwnTrackingPixelsFromHtml(html: string): string {
  const template = document.createElement('template');
  template.innerHTML = html;
  removeOwnTrackingPixels(template.content);
  return template.innerHTML;
}
