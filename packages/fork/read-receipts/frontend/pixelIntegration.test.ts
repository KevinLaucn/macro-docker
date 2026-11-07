import { decodeBase64Utf8 } from '@app/features/email-compose/core/decode-base64';
import { prepareEmailBodyFromHtml } from '@app/features/email-compose/primitives/prepare-email-body';
import { createEmailMessageBody } from '@app/features/email-message/primitives/email-message-body';
import { message } from '@app/features/email-message/tests/messages';
import { toEmailThread } from '@app/features/email-thread/queries/thread-source';
import type { ApiThread } from '@service-email/generated/schemas';
import { QueryClient, QueryClientProvider } from '@tanstack/solid-query';
import { createComponent, createRoot } from 'solid-js';
import { render } from 'solid-js/web';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ReadReceiptStatus } from './ReadReceiptStatus';

const pixel = 'https://email-service.macro.com/t/o/old-receipt-token';
const officialPixel = 'https://email-service.macro.com/opens/official-receipt-token';
const ordinary = 'https://example.com/logo.png';
const html = `<p>History</p><img src="${pixel}" width="1" height="1"><img src="${officialPixel}" width="1" height="1"><img src="${ordinary}">`;

afterEach(() => vi.unstubAllGlobals());

describe('upstream renderer/composer → pixel side-effect exclusions', () => {
  it.each([
    { replyType: 'reply' as const, isSent: true },
    { replyType: 'forward' as const, isSent: true },
    { replyType: 'reply' as const, isSent: false },
    { replyType: 'forward' as const, isSent: false },
  ])(
    'removes historical pixels from $replyType (sent: $isSent)',
    ({ replyType, isSent }) => {
      const prepared = prepareEmailBodyFromHtml('<p>New content</p>', {
        replyType,
        replyingTo: message('original', {
          is_sent: isSent,
          body_html_sanitized: html,
        }),
      });
      const outgoing = decodeBase64Utf8(prepared.bodyHtml);
      expect(outgoing).not.toContain(pixel);
      expect(outgoing).not.toContain(officialPixel);
      expect(outgoing).toContain(ordinary);
      expect(outgoing).toContain('History');
    }
  );

  it.each([
    { showFullContent: false, isSent: true, showReadReceiptPixel: false },
    { showFullContent: true, isSent: true, showReadReceiptPixel: false },
    { showFullContent: false, isSent: false, showReadReceiptPixel: false },
    { showFullContent: true, isSent: false, showReadReceiptPixel: false },
    { showFullContent: true, isSent: false, showReadReceiptPixel: undefined },
    { showFullContent: true, isSent: false, showReadReceiptPixel: true },
  ])(
    'protects sender/unknown copies and permits recipients: %j',
    async ({ showFullContent, isSent, showReadReceiptPixel }) => {
      const permitsPixel = !isSent && showReadReceiptPixel === true;
      vi.stubGlobal(
        'ResizeObserver',
        class {
          observe() {}
          disconnect() {}
        }
      );
      const resolveImages = vi.fn(async (root: ParentNode) => {
        expect(Boolean(root.querySelector(`img[src="${pixel}"]`))).toBe(
          permitsPixel
        );
      });
      const root = createRoot((dispose) => ({
        dispose,
        body: createEmailMessageBody(
          {
            message: message('sent', {
              is_sent: isSent,
              body_html_sanitized: html,
              body_replyless: html,
            }),
            isPersonal: true,
            isBodyExpanded: () => true,
            setExpandedMessageBody() {},
            setFocusedMessageId() {},
            isFocused: false,
            showFullContent,
            showReadReceiptPixel,
          },
          {
            theme: () => ({
              inkL: 0.2,
              inkC: 0,
              inkH: 0,
              panelL: 1,
              accentL: 0.6,
              accentC: 0.1,
              accentH: 50,
            }),
            resolveImages,
          }
        ),
      }));
      try {
        await Promise.resolve();
        expect(
          Boolean(
            root.body.host()?.shadowRoot?.querySelector(`img[src="${pixel}"]`)
          )
        ).toBe(permitsPixel);
        expect(
          Boolean(
            root.body
              .host()
              ?.shadowRoot?.querySelector(`img[src="${officialPixel}"]`)
          )
        ).toBe(permitsPixel);
        expect(
          root.body.host()?.shadowRoot?.querySelector(`img[src="${ordinary}"]`)
        ).not.toBeNull();
        expect(resolveImages).toHaveBeenCalled();
      } finally {
        root.dispose();
      }
    }
  );
});

function buildApiMessage(
  overrides: Partial<ApiThread['messages'][number]> & { db_id: string }
): ApiThread['messages'][number] {
  return {
    has_attachments: false,
    is_starred: false,
    attachments: [],
    attachments_draft: [],
    attachments_forwarded: [],
    bcc: [],
    body_html_sanitized: '<p>Hello</p>',
    body_macro: null,
    body_replyless: '<p>Hello</p>',
    body_text: 'Hello',
    calendar_invitations: [],
    cc: [],
    created_at: '2026-11-06T10:00:00Z',
    draft_generation: 0,
    from: { email: 'me@example.com', name: 'Me', photo_url: null },
    internal_date_ts: '2026-11-06T10:00:00Z',
    is_draft: false,
    is_read: true,
    is_sent: false,
    labels: [],
    link_id: 'link-1',
    operation_status: null,
    provider_id: `prov-${overrides.db_id}`,
    replying_to_id: null,
    scheduled_send_status: null,
    scheduled_send_time: null,
    sent_at: '2026-11-06T10:00:00Z',
    snippet: 'Hello',
    subject: 'Subject',
    thread_db_id: 'thread-1',
    to: [{ email: 'peer@example.com', name: 'Peer', photo_url: null }],
    updated_at: '2026-11-06T10:00:00Z',
    ...overrides,
  };
}

describe('toEmailThread mapper → ReadReceiptStatus integration', () => {
  it('preserves server is_sent through toEmailThread and renders ReadReceiptStatus accurately across all message states', () => {
    const apiThread: ApiThread = {
      access_level: 'owner',
      created_at: '2026-11-06T10:00:00Z',
      db_id: 'thread-1',
      has_received_mail: true,
      inbox_visible: true,
      is_read: true,
      latest_inbound_message_ts: '2026-11-06T10:00:00Z',
      link_id: 'link-1',
      project_id: null,
      provider_id: 'prov-thread-1',
      updated_at: '2026-11-06T10:00:00Z',
      messages: [
        // 1. Confirmed sent message (not yet opened)
        buildApiMessage({
          db_id: 'msg-sent-unopened',
          is_sent: true,
          is_draft: false,
        }),
        // 2. Confirmed sent message (opened by recipient via pixel)
        buildApiMessage({
          db_id: 'msg-sent-opened',
          is_sent: true,
          is_draft: false,
        }),
        // 3. Newer reply after an opened message (must NOT inherit previous open status)
        buildApiMessage({
          db_id: 'msg-sent-newer-reply',
          is_sent: true,
          is_draft: false,
          replying_to_id: 'msg-sent-opened',
        }),
        // 4. Draft message (even if server had is_sent=true or sender is me)
        buildApiMessage({
          db_id: 'msg-draft',
          is_sent: true,
          is_draft: true,
        }),
        // 5. Received inbound copy (is_sent=false, even when is_read=true and from=me)
        buildApiMessage({
          db_id: 'msg-received-read',
          is_sent: false,
          is_draft: false,
          is_read: true,
          from: { email: 'me@example.com', name: 'Me', photo_url: null },
        }),
        // 6. Queued / submitting message
        buildApiMessage({
          db_id: 'msg-queued',
          is_sent: true,
          is_draft: false,
          operation_status: {
            state: 'SUBMITTING',
            revision: 'rev-1',
            remote_version: null,
            issue: null,
          },
        }),
        // 7. Undone / cancelled message
        buildApiMessage({
          db_id: 'msg-cancelled',
          is_sent: true,
          is_draft: false,
          operation_status: {
            state: 'CANCELLED',
            revision: 'rev-2',
            remote_version: null,
            issue: null,
          },
        }),
        // 8. Failed delivery message
        buildApiMessage({
          db_id: 'msg-failed',
          is_sent: true,
          is_draft: false,
          operation_status: {
            state: 'FAILED',
            revision: 'rev-3',
            remote_version: null,
            issue: 'SEND_REJECTED',
          },
        }),
        // 9. Scheduled unsent message
        buildApiMessage({
          db_id: 'msg-scheduled-pending',
          is_sent: true,
          is_draft: false,
          scheduled_send_status: 'pending',
          scheduled_send_time: '2026-12-01T10:00:00Z',
          sent_at: null,
        }),
      ],
    };

    const mappedThread = toEmailThread(apiThread);
    const byId = Object.fromEntries(
      mappedThread.messages.map((m) => [m.db_id, m])
    );

    expect(byId['msg-sent-unopened']?.is_sent).toBe(true);
    expect(byId['msg-received-read']?.is_sent).toBe(false);

    const queryClient = new QueryClient();
    queryClient.setQueryData(['email', 'read-receipt', 'msg-sent-unopened'], {
      message_id: 'msg-sent-unopened',
      first_opened_at: null,
      last_opened_at: null,
      open_count: 0,
    });
    queryClient.setQueryData(['email', 'read-receipt', 'msg-sent-opened'], {
      message_id: 'msg-sent-opened',
      first_opened_at: '2026-11-06T10:05:00Z',
      last_opened_at: '2026-11-06T10:05:00Z',
      open_count: 2,
    });
    queryClient.setQueryData(
      ['email', 'read-receipt', 'msg-sent-newer-reply'],
      {
        message_id: 'msg-sent-newer-reply',
        first_opened_at: null,
        last_opened_at: null,
        open_count: 0,
      }
    );

    const renderStatus = (msgId: string) => {
      const container = document.createElement('div');
      const dispose = render(
        () =>
          createComponent(QueryClientProvider, {
            client: queryClient,
            get children() {
              return createComponent(ReadReceiptStatus, {
                message: byId[msgId]!,
                showIconOnly: false,
              });
            },
          }),
        container
      );
      const htmlContent = container.innerHTML;
      const textContent = container.textContent ?? '';
      dispose();
      return { htmlContent, textContent };
    };

    // 1. Confirmed sent unopened -> renders Not opened yet (single check, muted color)
    const sentUnopened = renderStatus('msg-sent-unopened');
    expect(sentUnopened.textContent).toContain('Not opened yet');
    expect(sentUnopened.htmlContent).toContain('text-ink-extra-muted');
    expect(sentUnopened.htmlContent).not.toContain('text-orange');

    // 2. Confirmed sent opened -> renders Opened (double check, orange color)
    const sentOpened = renderStatus('msg-sent-opened');
    expect(sentOpened.textContent).toContain('Opened');
    expect(sentOpened.textContent).toContain('2 times');
    expect(sentOpened.htmlContent).toContain('text-orange');

    // 3. Newer reply after opened message -> renders Not opened yet, does NOT inherit Opened
    const newerReply = renderStatus('msg-sent-newer-reply');
    expect(newerReply.textContent).toContain('Not opened yet');
    expect(newerReply.textContent).not.toContain('Opened');
    expect(newerReply.htmlContent).not.toContain('text-orange');

    // 4-9. Draft, received (is_read=true), queued, cancelled, failed, scheduled -> render nothing
    for (const nonEligibleId of [
      'msg-draft',
      'msg-received-read',
      'msg-queued',
      'msg-cancelled',
      'msg-failed',
      'msg-scheduled-pending',
    ]) {
      const rendered = renderStatus(nonEligibleId);
      expect(rendered.textContent).toBe('');
      expect(rendered.htmlContent).toBe('');
    }
  });
});
