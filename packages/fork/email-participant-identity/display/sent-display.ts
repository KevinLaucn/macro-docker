import type { EmailParticipant } from "../types";
import { resolveParticipantIdentities } from "../identity/participant-identity";

export function buildSentDisplay(
	participants: readonly EmailParticipant[],
	selfEmailSet: ReadonlySet<string>,
) {
	const resolved = resolveParticipantIdentities(participants, selfEmailSet);
	const externals = resolved.filter((participant) => !participant.isSelf);
	return externals.length > 0 ? externals : resolved;
}
