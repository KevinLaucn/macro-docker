import { normalizeEmail } from "../identity/normalize-email";
import type { ContactAvatar } from "../types";

export function resolveContactAvatar(
	email: string,
	contacts: readonly ContactAvatar[],
): string | undefined {
	const normalized = normalizeEmail(email);
	const primary = contacts.find(
		(contact) =>
			normalizeEmail(contact.email) === normalized &&
			contact.source === "primary" &&
			Boolean(contact.photoUrl),
	);
	if (primary?.photoUrl) return primary.photoUrl;
	return contacts.find(
		(contact) =>
			normalizeEmail(contact.email) === normalized &&
			contact.source === "other" &&
			Boolean(contact.photoUrl),
	)?.photoUrl;
}
