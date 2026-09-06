import { emailToMacroId } from '@core/user';
import type { ApiMessage } from '@service-email/generated/schemas';
import { getFirstName } from './name';

/**
 * Check if a message is from the current user or linked inboxes
 */
export function isMessageFromCurrentUser(
  message: ApiMessage,
  currentUserEmail?: string,
  connectedEmails?: Array<string | undefined | null>
): boolean {
  const fromEmail = message.from?.email?.toLowerCase();
  if (!fromEmail) return false;
  if (currentUserEmail && fromEmail === currentUserEmail.toLowerCase()) {
    return true;
  }
  if (connectedEmails) {
    return connectedEmails.some(
      (email) => email && email.toLowerCase() === fromEmail
    );
  }
  return false;
}

/**
 * Get the sender display name, showing "Me" for the current user
 */
export function getSenderDisplayName(
  message: ApiMessage,
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
export function getSenderMacroId(message: ApiMessage): string | undefined {
  const senderEmail = message.from?.email;
  return senderEmail ? emailToMacroId(senderEmail) : undefined;
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
