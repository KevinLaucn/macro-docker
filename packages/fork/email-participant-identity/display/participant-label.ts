import { participantLabel } from '../identity/participant-identity';
import type { EmailParticipant, ParticipantDisplay } from '../types';

export function getParticipantLabel(
  participant: EmailParticipant,
  selfEmailSet: ReadonlySet<string>
): ParticipantDisplay {
  return participantLabel(participant, selfEmailSet);
}
