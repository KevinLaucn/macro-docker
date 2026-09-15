export { EmailParticipantIdentity } from "./components/EmailParticipantIdentity";
export { resolveContactAvatar } from "./avatar/avatar-policy";
export { resolveAvatarUrl } from "./avatar/avatar-resolver";
export { buildSentDisplay } from "./display/sent-display";
export { buildThreadDisplay } from "./display/thread-display";
export { getParticipantLabel } from "./display/participant-label";
export { normalizeEmail } from "./identity/normalize-email";
export {
	isSelfEmail,
	participantLabel,
	resolveParticipantIdentities,
} from "./identity/participant-identity";
export { resolveSelfEmails } from "./identity/resolve-self-emails";
export type {
	ContactAvatar,
	EmailMessage,
	EmailParticipant,
	EmailViewMode,
	ParticipantDisplay,
} from "./types";
