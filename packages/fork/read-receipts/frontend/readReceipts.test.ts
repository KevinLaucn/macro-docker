import { QueryClient, QueryClientProvider } from '@tanstack/solid-query';
import { describe, expect, it } from 'vitest';
import { readReceiptsClient } from './client';
import {
  formatSeenLabel,
  removeOwnTrackingPixels,
  stripOwnTrackingPixelsFromHtml,
} from './legacy';
import {
  fetchReadReceiptStatusBatched,
  flushReadReceiptStatusBatch,
  handleReadReceiptOpenedEvent,
} from './queries';
import {
  isMacroTrackingPixelUrl,
  stripBlockedTrackingPixelsFromHtml,
} from './utils';

const TOKEN = 'open-tracking-token-test';

describe('removeOwnTrackingPixels', () => {
  it('removes Macro open tracking images and keeps ordinary images', () => {
    const doc = new DOMParser().parseFromString(
      `<p>hi</p><img src="https://email-service.macro.com/t/o/${TOKEN}"><img src="https://example.com/logo.png">`,
      'text/html'
    );

    removeOwnTrackingPixels(doc);

    expect(doc.querySelectorAll('img')).toHaveLength(1);
    expect(doc.querySelector('img')?.getAttribute('src')).toBe(
      'https://example.com/logo.png'
    );
  });
});

describe('stripOwnTrackingPixelsFromHtml', () => {
  it('strips the receipt before sent-mail HTML is rendered', () => {
    const html = `<p>sent</p><img src="https://email-service-dev.macro.com/t/o/${TOKEN}" width="1" height="1">`;
    const stripped = stripOwnTrackingPixelsFromHtml(html);

    expect(stripped).toContain('<p>sent</p>');
    expect(stripped).not.toContain('/t/o/');
  });
});

describe('formatSeenLabel', () => {
  it('formats recent opens relative to now', () => {
    expect(formatSeenLabel(new Date())).toBe('Seen just now');
    expect(formatSeenLabel(new Date(Date.now() - 5 * 60_000))).toBe(
      'Seen 5m ago'
    );
  });
});

describe('isMacroTrackingPixelUrl', () => {
  it('recognizes official macro.com tracking URLs', () => {
    expect(
      isMacroTrackingPixelUrl(`https://email-service.macro.com/t/o/${TOKEN}`)
    ).toBe(true);
    expect(
      isMacroTrackingPixelUrl(
        `https://email-service-dev.macro.com/t/o/${TOKEN}`
      )
    ).toBe(true);
  });

  it('recognizes same-origin tracking URLs', () => {
    const origin = window.location.origin;
    expect(isMacroTrackingPixelUrl(`${origin}/t/o/${TOKEN}`)).toBe(true);
  });

  it('recognizes configured cross-origin self-host tracking URLs', () => {
    const customService = 'https://email.mycompany.com';
    expect(
      isMacroTrackingPixelUrl(`${customService}/t/o/${TOKEN}`, customService)
    ).toBe(true);
  });

  it('does not recognize third-party lookalike /t/o/ URLs as Macro tracking pixels', () => {
    expect(
      isMacroTrackingPixelUrl(`https://tracker.example.com/t/o/${TOKEN}`)
    ).toBe(false);
    expect(
      isMacroTrackingPixelUrl('https://cdn.example.com/t/o/banner.jpg')
    ).toBe(false);
  });
});

describe('stripBlockedTrackingPixelsFromHtml', () => {
  it('removes 1x1, style 1px, and macro pixels while preserving cid and normal images', () => {
    const html = `
      <p>Hello</p>
      <img src="https://tracker.com/pixel.gif" width="1" height="1">
      <img src="https://tracker.com/pixel2.gif" style="width:1px;height:1px">
      <img src="https://email-service.macro.com/t/o/${TOKEN}">
      <img src="cid:embedded-image@123" width="1" height="1">
      <img src="https://cdn.example.com/t/o/banner.jpg" width="400" height="200">
      <img src="https://example.com/logo.png" width="120" height="40">
    `;

    const cleaned = stripBlockedTrackingPixelsFromHtml(html);

    expect(cleaned).not.toContain('pixel.gif');
    expect(cleaned).not.toContain('pixel2.gif');
    expect(cleaned).not.toContain(TOKEN);
    expect(cleaned).toContain('cid:embedded-image@123');
    expect(cleaned).toContain('https://cdn.example.com/t/o/banner.jpg');
    expect(cleaned).toContain('https://example.com/logo.png');
  });
});

import { ok } from 'neverthrow';

describe('batching read receipt status queries', () => {
  it('batches concurrent status requests into a single getStatuses call', async () => {
    let callCount = 0;
    let requestedIds: string[] = [];

    const originalGetStatuses = readReceiptsClient.getStatuses;
    readReceiptsClient.getStatuses = async (ids: string[]) => {
      callCount += 1;
      requestedIds = ids;
      return ok({
        statuses: ids.map((id) => ({
          message_id: id,
          first_opened_at: '2026-09-12T00:00:00Z',
          last_opened_at: '2026-09-12T00:00:00Z',
          open_count: 1,
        })),
      });
    };

    try {
      const queryClient = new QueryClient();
      const p1 = fetchReadReceiptStatusBatched('msg-1', queryClient);
      const p2 = fetchReadReceiptStatusBatched('msg-2', queryClient);
      const p3 = fetchReadReceiptStatusBatched('msg-3', queryClient);

      // Flush microtask batch
      flushReadReceiptStatusBatch(queryClient);

      const [res1, res2, res3] = await Promise.all([p1, p2, p3]);

      expect(callCount).toBe(1);
      expect(requestedIds).toEqual(['msg-1', 'msg-2', 'msg-3']);
      expect(res1.message_id).toBe('msg-1');
      expect(res2.message_id).toBe('msg-2');
      expect(res3.message_id).toBe('msg-3');

      // Verify QueryCache populated
      const cached = queryClient.getQueryData([
        'email',
        'read-receipt',
        'msg-1',
      ]);
      expect(cached).toEqual(res1);
    } finally {
      readReceiptsClient.getStatuses = originalGetStatuses;
    }
  });

  it('handleReadReceiptOpenedEvent updates query cache in real time', () => {
    const queryClient = new QueryClient();
    handleReadReceiptOpenedEvent(
      {
        messageId: 'msg-realtime-1',
        openCount: 3,
        lastOpenedAt: '2026-09-16T12:00:00Z',
      },
      queryClient
    );

    const cached = queryClient.getQueryData([
      'email',
      'read-receipt',
      'msg-realtime-1',
    ]);
    expect(cached).toEqual({
      message_id: 'msg-realtime-1',
      first_opened_at: '2026-09-16T12:00:00Z',
      last_opened_at: '2026-09-16T12:00:00Z',
      open_count: 3,
    });
  });

  it('handleReadReceiptOpenedEvent also updates thread query cache for matching latest message', () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(['email', 'read-receipt-thread', 'thread-1'], {
      thread_id: 'thread-1',
      latest_message_id: 'msg-realtime-2',
      is_last_message_sent: true,
      is_opened: false,
      open_count: 0,
      first_opened_at: null,
      last_opened_at: null,
    });

    handleReadReceiptOpenedEvent(
      {
        messageId: 'msg-realtime-2',
        openCount: 1,
        lastOpenedAt: '2026-09-16T12:05:00Z',
      },
      queryClient
    );

    const threadCached = queryClient.getQueryData<{
      is_opened: boolean;
      open_count: number;
    }>(['email', 'read-receipt-thread', 'thread-1']);
    expect(threadCached?.is_opened).toBe(true);
    expect(threadCached?.open_count).toBe(1);
  });
});

import { createComponent, createRoot, createSignal } from 'solid-js';
import {
  useEmailListEnvelopeClass,
  useEmailListEnvelopeHighlight,
} from './queries';

describe('useEmailListEnvelopeHighlight', () => {
  it('highlights envelope with !text-orange strictly when sent email is opened', () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(['email', 'read-receipt-thread', 'thread-1'], {
      thread_id: 'thread-1',
      latest_sent_message_id: 'msg-1',
      is_opened: true,
    });

    createRoot((dispose) => {
      createComponent(QueryClientProvider, {
        client: queryClient,
        get children() {
          const [sentEntity] = createSignal({
            type: 'email',
            id: 'thread-1',
            emailIdentityViewMode: 'sent',
          });
          const [inboxEntity] = createSignal({
            type: 'email',
            id: 'thread-1',
            emailIdentityViewMode: 'inbox',
          });

          expect(useEmailListEnvelopeHighlight(sentEntity)()).toBe(true);
          expect(useEmailListEnvelopeClass(sentEntity)()).toBe('!text-orange');
          expect(useEmailListEnvelopeHighlight(inboxEntity)()).toBe(false);
          return null;
        },
      });
      dispose();
    });
  });
});
