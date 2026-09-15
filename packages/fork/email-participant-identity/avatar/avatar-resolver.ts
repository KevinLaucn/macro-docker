import { resolveContactAvatar } from "./avatar-policy";
import type { ContactAvatar } from "../types";

export function resolveAvatarUrl(
	email: string,
	contacts: readonly ContactAvatar[],
	fallback?: string,
): string | undefined {
	return resolveContactAvatar(email, contacts) ?? fallback;
}
