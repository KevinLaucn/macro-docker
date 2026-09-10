import type { EmailMessage } from '@app/features/email-message/core/email-message';

import { getFirstName } from './name';

/**
 * Check if a message is an outbound message from the current user/inbox
 */
export function isMessageFromCurrentUser(
  message: EmailMessage,
  _currentUserEmail?: string
): boolean {
  if (message.is_sent) return true;
  if (message.is_draft) return true;
  if (message.scheduled_send_time) return true;
  if (
    message.labels?.some(
      (l) => l.provider_label_id === 'SENT' || l.name === 'SENT'
    )
  ) {
    return true;
  }
  return false;
}

/**
 * Get the sender display name, showing "Me" for the current user
 */
export function getSenderDisplayName(
  message: EmailMessage,
  currentUserEmail?: string
): string {
  if (isMessageFromCurrentUser(message, currentUserEmail)) {
    return 'Me';
  }
  const from = message.from;
  if (!from) return 'Unknown';
  if (from.name) {
    return getFirstName(from.name);
  }
  return from.email ?? 'Unknown';
}

/**
 * Convert the message sender email to a macro id for user tooling.
 */
export function getSenderMacroId(message: EmailMessage): string | undefined {
  const senderEmail = message.from?.email;
  return senderEmail?.includes('@') ? `macro|${senderEmail}` : undefined;
}

interface Recipient {
  name?: string | null;
  email?: string | null;
}

/**
 * Get recipient display name, showing "Me" for the current user
 */
export function getRecipientDisplayName(
  recipient: Recipient,
  currentUserEmail?: string
): string {
  if (recipient.email === currentUserEmail) return 'Me';
  return recipient.name
    ? getFirstName(recipient.name)
    : (recipient.email?.split('@')[0] ?? '');
}
