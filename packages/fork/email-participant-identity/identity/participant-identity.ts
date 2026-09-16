import type { EmailParticipant, ParticipantDisplay } from "../types";
import { normalizeEmail } from "./normalize-email";

const SELF_IDENTITY_KEY = "__self__";

export function isSelfEmail(email: string, selfEmailSet: ReadonlySet<string>) {
	return selfEmailSet.has(normalizeEmail(email));
}

export function participantLabel(
	participant: EmailParticipant,
	selfEmailSet: ReadonlySet<string>,
): ParticipantDisplay {
	const isSelf = isSelfEmail(participant.email, selfEmailSet);
	return {
		email: participant.email,
		label: isSelf
			? "me"
			: participant.name?.trim() || participant.email.split("@")[0],
		photoUrl: participant.photoUrl,
		isSelf,
	};
}

/**
 * Deduplicates external participants by normalized address while collapsing all
 * linked self inboxes into a single logical "me" identity.
 */
export function resolveParticipantIdentities(
	participants: readonly EmailParticipant[],
	selfEmailSet: ReadonlySet<string>,
): ParticipantDisplay[] {
	const seen = new Set<string>();
	return participants.flatMap((participant) => {
		const email = normalizeEmail(participant.email);
		if (!email) return [];

		const dedupeKey = isSelfEmail(email, selfEmailSet)
			? SELF_IDENTITY_KEY
			: email;
		if (seen.has(dedupeKey)) return [];
		seen.add(dedupeKey);

		return [participantLabel(participant, selfEmailSet)];
	});
}

/**
 * Returns true if the thread participants list contains only self emails
 * (or is empty), meaning outbound recipients need to be resolved.
 */
export function needOutboundRecipients(
	participants: readonly EmailParticipant[] | undefined,
	selfEmailSet: ReadonlySet<string>,
): boolean {
	if (!participants || participants.length === 0) return true;
	return participants.every((p) => isSelfEmail(p.email, selfEmailSet));
}

/**
 * Extracts external recipient contacts (To, Cc) from message headers/objects,
 * deduplicated and excluding self email addresses.
 */
export function extractOutboundRecipients(
	messages: readonly {
		to?: readonly { email?: string | null; name?: string | null; photo_url?: string | null; photoUrl?: string | null }[] | null;
		cc?: readonly { email?: string | null; name?: string | null; photo_url?: string | null; photoUrl?: string | null }[] | null;
	}[],
	selfEmailSet: ReadonlySet<string>,
): EmailParticipant[] {
	const recipients: EmailParticipant[] = [];
	const seen = new Set<string>();
	for (const m of messages) {
		for (const r of [...(m.to ?? []), ...(m.cc ?? [])]) {
			const email = r.email?.trim();
			if (!email) continue;
			const norm = normalizeEmail(email);
			if (norm && !isSelfEmail(norm, selfEmailSet) && !seen.has(norm)) {
				seen.add(norm);
				recipients.push({
					email,
					name: r.name?.trim() || undefined,
					photoUrl: (r.photo_url || r.photoUrl) ?? undefined,
				});
			}
		}
	}
	return recipients;
}

