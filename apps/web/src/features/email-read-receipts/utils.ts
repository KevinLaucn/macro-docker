import { formatTime } from '@core/util/date';
import { t } from '@macro/i18n';
import type { ReadReceiptStatusData } from './client';

export function statusSeenAt(status?: ReadReceiptStatusData): Date | undefined {
  if (!status?.open_count || !status.last_opened_at) return undefined;
  return new Date(status.last_opened_at);
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
  const timeStr = formatTime(openDate);

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

    // Block Macro tracking pixels
    if (src.includes('/t/o/')) {
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
