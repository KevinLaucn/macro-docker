import type { ReadReceiptStatusData } from './client';
import {
  isMacroTrackingPixelUrl,
  removeOwnTrackingPixels,
  statusSeenAt,
  stripOwnTrackingPixelsFromHtml,
} from './utils';

export {
  isMacroTrackingPixelUrl,
  removeOwnTrackingPixels,
  statusSeenAt,
  stripOwnTrackingPixelsFromHtml,
};

/** Compact Seen label, e.g. `Seen 5m ago`. */
export function formatSeenLabel(seenAt: Date): string {
  const minutes = Math.floor((Date.now() - seenAt.getTime()) / 60_000);
  if (minutes < 1) return 'Seen just now';
  if (minutes < 60) return `Seen ${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Seen ${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `Seen ${days}d ago`;
  return `Seen ${seenAt.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })}`;
}

/** Full open detail for tooltips. */
export function formatSeenTooltip(status: ReadReceiptStatusData): string {
  const opens = status.open_count ?? 0;
  const first = status.first_opened_at
    ? new Date(status.first_opened_at).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    : undefined;
  const times = opens === 1 ? 'once' : `${opens} times`;
  return first ? `Opened ${times} · First seen ${first}` : `Opened ${times}`;
}
