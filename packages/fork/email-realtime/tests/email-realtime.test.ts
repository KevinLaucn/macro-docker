import { describe, expect, it } from 'vitest';
import { parseBrowserNewEmailNotification } from '../index';

describe('browser new email realtime adapter', () => {
  it('maps a backend event to the upstream new_email notification contract', () => {
    const sentAt = '2026-09-30T00:00:00.000Z';
    expect(
      parseBrowserNewEmailNotification(
        JSON.stringify({
          sender: 'Ada Lovelace',
          toEmail: 'ada@example.com',
          threadId: 'thread-1',
          subject: 'Hello',
          snippet: 'New message',
          sentAt,
        })
      )
    ).toEqual({
      id: `browser-new-email:thread-1:${sentAt}`,
      entity_id: 'thread-1',
      entity_type: 'email_thread',
      notification_event_type: 'new_email',
      notification_metadata: {
        tag: 'new_email',
        content: {
          sender: 'Ada Lovelace',
          toEmail: 'ada@example.com',
          threadId: 'thread-1',
          subject: 'Hello',
          snippet: 'New message',
          sentAt,
        },
      },
      sent: true,
      state: 'unseen',
      viewed_at: null,
      created_at: sentAt,
      updated_at: sentAt,
    });
  });

  it('rejects malformed backend events', () => {
    expect(
      parseBrowserNewEmailNotification('{"threadId":"missing-fields"}')
    ).toBeNull();
    expect(parseBrowserNewEmailNotification('not-json')).toBeNull();
  });
});
