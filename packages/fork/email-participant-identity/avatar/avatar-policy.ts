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

/**
 * Resolves avatar with fork priority:
 * Prioritize synced contact/Gmail photoUrl when provided, falling back to Macro profile picture.
 */
export function resolveAvatarWithPriority(
	photoUrl?: string,
	macroProfilePicUrl?: string,
): string | undefined {
	return photoUrl || macroProfilePicUrl;
}

/**
 * Resolves tooltip photo URL from either explicit prop or recipient contact photo_url.
 */
export function resolveTooltipPhotoUrl(
	photoUrl?: string,
	recipient?: { photo_url?: string | null } | null,
): string | undefined {
	return photoUrl || recipient?.photo_url || undefined;
}


