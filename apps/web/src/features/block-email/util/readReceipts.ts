import { SERVER_HOSTS } from '@core/constant/servers';
import type { ReadReceiptStatus } from '@service-email/readReceiptsClient';

const OPEN_TRACKING_PATH = '/t/o/';

function isMacroTrackingPixelUrl(src: string): boolean {
  if (!src.includes(OPEN_TRACKING_PATH)) return false;
  try {
    const url = new URL(src, typeof window !== 'undefined' ? window.location.origin : undefined);
    // Matches /t/o/... or reverse proxy path like /email/t/o/...
    if (!url.pathname.includes(OPEN_TRACKING_PATH)) return false;

    // Production/dev Macro email-service hosts are recognizable without any
    // runtime configuration, which also keeps unit tests deterministic.
    if (/^email-service[a-z0-9.-]*\.macro\.com$/.test(url.hostname)) {
      return true;
    }

    const configuredHost = SERVER_HOSTS['email-service'];
    if (configuredHost && url.origin === new URL(configuredHost, typeof window !== 'undefined' ? window.location.origin : undefined).origin) {
      return true;
    }

    if (typeof window !== 'undefined' && url.origin === window.location.origin) {
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * Removes Macro open-tracking pixels from a rendered sent-mail body. This
 * prevents the sender's own browser view from fetching its receipt pixel.
 */
export function removeOwnTrackingPixels(root: ParentNode): void {
  for (const img of Array.from(root.querySelectorAll('img'))) {
    const src = img.getAttribute('src') ?? '';
    if (isMacroTrackingPixelUrl(src)) img.remove();
  }
}

/**
 * Strips Macro tracking pixels while the HTML is still inert. A `<template>`
 * is deliberately used instead of a live div so browser image loading cannot
 * race the removal step. Sent-mail rendering calls this before the generic
 * image-proxy rewrite, preventing Macro's own image proxy from recording a
 * false open when the sender views their Sent copy.
 */
export function stripOwnTrackingPixelsFromHtml(html: string): string {
  const template = document.createElement('template');
  template.innerHTML = html;
  removeOwnTrackingPixels(template.content);
  return template.innerHTML;
}

export function statusSeenAt(status?: ReadReceiptStatus): Date | undefined {
  if (!status?.open_count || !status.last_opened_at) return undefined;
  return new Date(status.last_opened_at);
}

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
export function formatSeenTooltip(status: ReadReceiptStatus): string {
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
