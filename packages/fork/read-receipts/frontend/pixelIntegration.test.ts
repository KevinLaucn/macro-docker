import { decodeBase64Utf8 } from '@app/features/email-compose/core/decode-base64';
import { prepareEmailBodyFromHtml } from '@app/features/email-compose/primitives/prepare-email-body';
import { createEmailMessageBody } from '@app/features/email-message/primitives/email-message-body';
import { message } from '@app/features/email-message/tests/messages';
import { createRoot } from 'solid-js';
import { afterEach, describe, expect, it, vi } from 'vitest';

const pixel = 'https://email-service.macro.com/t/o/old-receipt-token';
const ordinary = 'https://example.com/logo.png';
const html = `<p>History</p><img src="${pixel}" width="1" height="1"><img src="${ordinary}">`;

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
          root.body.host()?.shadowRoot?.querySelector(`img[src="${ordinary}"]`)
        ).not.toBeNull();
        expect(resolveImages).toHaveBeenCalled();
      } finally {
        root.dispose();
      }
    }
  );
});
