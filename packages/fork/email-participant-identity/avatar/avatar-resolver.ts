import type { ContactAvatar } from '../types';
import { resolveContactAvatar } from './avatar-policy';

export function resolveAvatarUrl(
  email: string,
  contacts: readonly ContactAvatar[],
  fallback?: string
): string | undefined {
  return resolveContactAvatar(email, contacts) ?? fallback;
}
