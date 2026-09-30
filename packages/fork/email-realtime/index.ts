export type BrowserNewEmailNotificationPayload = {
  readonly sender?: string | null;
  readonly toEmail: string;
  readonly threadId: string;
  readonly subject: string;
  readonly snippet: string;
  readonly sentAt?: string;
};

export type EmailRealtimeNotification = {
  readonly id: string;
  readonly entity_id: string;
  readonly entity_type: 'email_thread';
  readonly notification_event_type: 'new_email';
  readonly notification_metadata: {
    readonly tag: 'new_email';
    readonly content: BrowserNewEmailNotificationPayload;
  };
  readonly sent: true;
  readonly state: 'unseen';
  readonly viewed_at: null;
  readonly created_at: string;
  readonly updated_at: string;
};

function isBrowserNewEmailNotificationPayload(
  raw: unknown
): raw is BrowserNewEmailNotificationPayload {
  if (!raw || typeof raw !== 'object') return false;
  const payload = raw as Partial<BrowserNewEmailNotificationPayload>;
  return (
    typeof payload.threadId === 'string' &&
    typeof payload.toEmail === 'string' &&
    typeof payload.subject === 'string' &&
    typeof payload.snippet === 'string'
  );
}

export function parseBrowserNewEmailNotification(
  data: string
): EmailRealtimeNotification | null {
  try {
    const raw: unknown = JSON.parse(data);
    if (!isBrowserNewEmailNotificationPayload(raw)) return null;

    const now = raw.sentAt ?? new Date().toISOString();
    return {
      id: `browser-new-email:${raw.threadId}:${now}`,
      entity_id: raw.threadId,
      entity_type: 'email_thread',
      notification_event_type: 'new_email',
      notification_metadata: {
        tag: 'new_email',
        content: raw,
      },
      sent: true,
      state: 'unseen',
      viewed_at: null,
      created_at: now,
      updated_at: now,
    };
  } catch {
    return null;
  }
}
