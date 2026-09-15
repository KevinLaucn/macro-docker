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
