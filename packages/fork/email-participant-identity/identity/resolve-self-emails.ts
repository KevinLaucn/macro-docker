import { normalizeEmail } from "./normalize-email";

export type EmailLink = {
	email_address: string;
	is_delegated?: boolean;
	isDelegated?: boolean;
};

/**
 * Resolves self email addresses from linked inboxes.
 * Filters out delegated / shared inboxes so that only personally owned Gmail
 * inboxes are recognized as the logical "me" identity.
 */
export function resolveSelfEmails(links: readonly EmailLink[]): Set<string> {
	return new Set(
		links
			.filter((link) => !link.is_delegated && !link.isDelegated)
			.map((link) => normalizeEmail(link.email_address))
			.filter((email) => email.length > 0),
	);
}
