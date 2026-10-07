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
  it.each(['reply', 'forward'] as const)(
    'removes historical pixels from a real %s body',
    (replyType) => {
      const prepared = prepareEmailBodyFromHtml('<p>New content</p>', {
        replyType,
        replyingTo: message('original', {
          is_sent: true,
          body_html_sanitized: html,
        }),
      });
      const outgoing = decodeBase64Utf8(prepared.bodyHtml);
      expect(outgoing).not.toContain(pixel);
      expect(outgoing).toContain(ordinary);
      expect(outgoing).toContain('History');
    }
  );

  it.each([false, true])(
    'keeps Sent rendering free of our own pixels (full body: %s)',
    async (showFullContent) => {
      vi.stubGlobal(
        'ResizeObserver',
        class {
          observe() {}
          disconnect() {}
        }
      );
      const resolveImages = vi.fn(async (root: ParentNode) => {
        expect(root.querySelector(`img[src="${pixel}"]`)).toBeNull();
      });
      const root = createRoot((dispose) => ({
        dispose,
        body: createEmailMessageBody(
          {
            message: message('sent', {
              is_sent: true,
              body_html_sanitized: html,
              body_replyless: html,
            }),
            isPersonal: true,
            isBodyExpanded: () => true,
            setExpandedMessageBody() {},
            setFocusedMessageId() {},
            isFocused: false,
            showFullContent,
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
          root.body.host()?.shadowRoot?.querySelector(`img[src="${pixel}"]`)
        ).toBeNull();
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
