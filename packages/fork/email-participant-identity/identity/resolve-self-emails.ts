import { normalizeEmail } from "./normalize-email";

type EmailLink = { email_address: string };

export function resolveSelfEmails(links: readonly EmailLink[]): Set<string> {
	return new Set(
		links
			.map((link) => normalizeEmail(link.email_address))
			.filter((email) => email.length > 0),
	);
}
