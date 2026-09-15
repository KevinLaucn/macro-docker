import type { EmailMessage, EmailParticipant, EmailViewMode } from "../types";
import {
	isSelfEmail,
	resolveParticipantIdentities,
} from "../identity/participant-identity";
import { normalizeEmail } from "../identity/normalize-email";
import { buildSentDisplay } from "./sent-display";

export type ThreadDisplay = {
	participants: ReturnType<typeof resolveParticipantIdentities>;
	direction?: string;
	separator: "arrow" | "comma";
};

function lastRealMessage(messages: readonly EmailMessage[]) {
	return [...messages]
		.filter((message) => !message.isDraft)
		.sort((a, b) =>
			String(a.sentAt ?? "").localeCompare(String(b.sentAt ?? "")),
		)
		.at(-1);
}

function selfParticipant(selfEmailSet: ReadonlySet<string>) {
	const email = selfEmailSet.values().next().value;
	if (!email) return undefined;
	return resolveParticipantIdentities([{ email }], selfEmailSet)[0];
}

/**
 * Produces the participant order used by the list UI.
 *
 * - inbound: external participants -> me
 * - outbound: me -> external participants
 * - bidirectional with external reply: external participants, me
 * - sent: external recipients only, no arrow
 *
 * `latestSender` is the lightweight Soup-list path. Full thread consumers can
 * keep supplying `messages`, where the last non-draft message wins.
 */
export function buildThreadDisplay(args: {
	participants: readonly EmailParticipant[];
	messages?: readonly EmailMessage[];
	latestSender?: EmailParticipant;
	selfEmailSet: ReadonlySet<string>;
	viewMode: EmailViewMode;
}): ThreadDisplay {
	if (args.viewMode === "sent") {
		return {
			participants: buildSentDisplay(args.participants, args.selfEmailSet),
			separator: "comma",
		};
	}

	const last = args.messages ? lastRealMessage(args.messages) : undefined;
	const sender = last?.from ?? args.latestSender;
	const candidates = sender
		? [...args.participants, sender]
		: [...args.participants];
	const resolved = resolveParticipantIdentities(candidates, args.selfEmailSet);
	if (!sender) return { participants: resolved, separator: "comma" };

	const me = resolved.find((participant) => participant.isSelf) ??
		selfParticipant(args.selfEmailSet);
	const externals = resolved.filter((participant) => !participant.isSelf);
	if (!me || externals.length === 0) return { participants: resolved, separator: "comma" };

	const senderIsSelf = isSelfEmail(sender.email, args.selfEmailSet);
	if (!senderIsSelf) {
		const senderEmail = normalizeEmail(sender.email);
		externals.sort((a, b) => {
			const aIsSender = normalizeEmail(a.email) === senderEmail;
			const bIsSender = normalizeEmail(b.email) === senderEmail;
			return Number(bIsSender) - Number(aIsSender);
		});
	}

	const realMessages = args.messages ? args.messages.filter((m) => !m.isDraft) : [];
	const hasSelfMessage = realMessages.some((m) => m.from && isSelfEmail(m.from.email, args.selfEmailSet));
	const hasExternalMessage = realMessages.some((m) => m.from && !isSelfEmail(m.from.email, args.selfEmailSet));
	const isBidirectional = hasSelfMessage && hasExternalMessage;

	const separator = isBidirectional && !senderIsSelf ? "comma" : "arrow";
	const participants = senderIsSelf ? [me, ...externals] : [...externals, me];
	const externalLabels = externals.map(({ label }) => label).join(", ");
	return {
		participants,
		direction: separator === "comma"
			? `${externalLabels}, ${me.label}`
			: senderIsSelf
				? `${me.label} → ${externalLabels}`
				: `${externalLabels} → ${me.label}`,
		separator,
	};
}
