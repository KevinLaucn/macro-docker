import type { EmailParticipant, ParticipantDisplay } from "../types";
import { normalizeEmail } from "./normalize-email";

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

/** Deduplicates by normalized address, never by display name. */
export function resolveParticipantIdentities(
	participants: readonly EmailParticipant[],
	selfEmailSet: ReadonlySet<string>,
): ParticipantDisplay[] {
	const seen = new Set<string>();
	return participants.flatMap((participant) => {
		const email = normalizeEmail(participant.email);
		if (!email || seen.has(email)) return [];
		seen.add(email);
		return [participantLabel(participant, selfEmailSet)];
	});
}
