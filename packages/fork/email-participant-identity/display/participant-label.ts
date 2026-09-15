import type { EmailParticipant, ParticipantDisplay } from "../types";
import { participantLabel } from "../identity/participant-identity";

export function getParticipantLabel(
	participant: EmailParticipant,
	selfEmailSet: ReadonlySet<string>,
): ParticipantDisplay {
	return participantLabel(participant, selfEmailSet);
}
