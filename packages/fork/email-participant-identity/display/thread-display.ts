import type { EmailMessage, EmailParticipant, EmailViewMode } from "../types";
import { resolveParticipantIdentities } from "../identity/participant-identity";

export type ThreadDisplay = {
	participants: ReturnType<typeof resolveParticipantIdentities>;
	direction?: string;
};

function lastRealMessage(messages: readonly EmailMessage[]) {
	return [...messages]
		.filter((message) => !message.isDraft)
		.sort((a, b) =>
			String(a.sentAt ?? "").localeCompare(String(b.sentAt ?? "")),
		)
		.at(-1);
}

function recipients(message: EmailMessage): EmailParticipant[] {
	return [...(message.to ?? []), ...(message.cc ?? [])];
}

export function buildThreadDisplay(args: {
	participants: readonly EmailParticipant[];
	messages?: readonly EmailMessage[];
	selfEmailSet: ReadonlySet<string>;
	viewMode: EmailViewMode;
}): ThreadDisplay {
	const resolved = resolveParticipantIdentities(
		args.participants,
		args.selfEmailSet,
	);
	if (args.viewMode === "sent") return { participants: resolved };

	const last = args.messages ? lastRealMessage(args.messages) : undefined;
	if (!last) return { participants: resolved };

	const from = last.from
		? resolveParticipantIdentities([last.from], args.selfEmailSet)[0]?.label
		: undefined;
	const to = resolveParticipantIdentities(
		recipients(last),
		args.selfEmailSet,
	)[0]?.label;
	return {
		participants: resolved,
		direction: from && to ? `${from} → ${to}` : undefined,
	};
}
