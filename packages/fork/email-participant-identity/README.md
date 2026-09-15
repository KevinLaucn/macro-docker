# Email participant identity

This fork feature owns the presentation rules for email participants:

- every linked Gmail address is normalized and displayed as `me`;
- external participants are deduplicated by normalized email, not by name;
- Sent displays recipients without an arrow;
- thread direction ignores drafts and follows the last real message;
- contact avatars prefer primary contacts, then Other Contacts, then the
  existing `UserIcon` initials fallback.

The upstream email entity extractor only resolves the current email-link set
and mounts `EmailParticipantIdentity`. Inbox attribution remains owned by the
upstream `EmailInboxChip` component.
