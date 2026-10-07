export {
  resolveAvatarWithPriority,
  resolveContactAvatar,
  resolveTooltipPhotoUrl,
} from './avatar/avatar-policy';
export { resolveAvatarUrl } from './avatar/avatar-resolver';
export { EmailParticipantIdentity } from './components/EmailParticipantIdentity';
export { getParticipantLabel } from './display/participant-label';
export { buildSentDisplay } from './display/sent-display';
export { buildThreadDisplay } from './display/thread-display';
export { normalizeEmail } from './identity/normalize-email';
export {
  extractOutboundRecipients,
  isSelfEmail,
  needOutboundRecipients,
  participantLabel,
  resolveParticipantIdentities,
} from './identity/participant-identity';
export { resolveSelfEmails } from './identity/resolve-self-emails';
export type {
  ContactAvatar,
  EmailMessage,
  EmailParticipant,
  EmailViewMode,
  ParticipantDisplay,
} from './types';
