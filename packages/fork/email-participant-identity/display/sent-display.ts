import type { EmailParticipant } from "../types";
import { resolveParticipantIdentities } from "../identity/participant-identity";

export function buildSentDisplay(
	participants: readonly EmailParticipant[],
	selfEmailSet: ReadonlySet<string>,
) {
	return resolveParticipantIdentities(participants, selfEmailSet).filter(
		(participant) => !participant.isSelf,
	);
}
