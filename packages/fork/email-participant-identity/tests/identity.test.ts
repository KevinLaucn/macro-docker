import { describe, expect, it } from "vitest";
import {
	buildSentDisplay,
	buildThreadDisplay,
	extractOutboundRecipients,
	needOutboundRecipients,
	resolveContactAvatar,
	resolveParticipantIdentities,
	resolveSelfEmails,
} from "../index";

const self = resolveSelfEmails([
	{ email_address: "user@gmail.com" },
	{ email_address: " SALES@gmail.com " },
]);

describe("email participant identity", () => {
	it("collapses every linked inbox into one me identity and leaves external names distinct", () => {
		expect(
			resolveParticipantIdentities(
				[
					{ email: "USER@gmail.com", name: "Kevin" },
					{ email: "sales@gmail.com", name: "Sales" },
					{ email: "a@example.com", name: "Alex" },
					{ email: "b@example.com", name: "Alex" },
				],
				self,
			).map(({ label }) => label),
		).toEqual(["me", "Alex", "Alex"]);
	});

	it("excludes delegated inboxes from self identity", () => {
		const selfWithDelegated = resolveSelfEmails([
			{ email_address: "user@gmail.com" },
			{ email_address: "support@company.com", is_delegated: true },
			{ email_address: "sales@company.com", isDelegated: true },
		]);
		expect(Array.from(selfWithDelegated)).toEqual(["user@gmail.com"]);
	});

	it("deduplicates external participants by normalized email, not display name", () => {
		expect(
			resolveParticipantIdentities(
				[
					{ email: " A@example.com ", name: "Alex" },
					{ email: "a@EXAMPLE.com", name: "Different header name" },
					{ email: "b@example.com", name: "Alex" },
				],
				self,
			).map(({ email }) => email),
		).toEqual([" A@example.com ", "b@example.com"]);
	});

	it("shows Sent recipients without me or an arrow", () => {
		expect(
			buildSentDisplay(
				[
					{ email: "user@gmail.com" },
					{ email: "a@example.com", name: "Danielle" },
				],
				self,
			).map(({ label }) => label),
		).toEqual(["Danielle"]);
	});

	it("falls back to self in Sent view if no external recipients exist", () => {
		expect(
			buildSentDisplay([{ email: "user@gmail.com" }], self).map(
				({ label }) => label,
			),
		).toEqual(["me"]);
	});

	it("detects when outbound thread needs recipient resolution and extracts external recipients", () => {
		expect(needOutboundRecipients([{ email: "user@gmail.com" }], self)).toBe(
			true,
		);
		expect(
			needOutboundRecipients(
				[
					{ email: "user@gmail.com" },
					{ email: "customer@example.com" },
				],
				self,
			),
		).toBe(false);

		const messages = [
			{
				to: [
					{ email: "customer@example.com", name: "Customer Name" },
					{ email: "user@gmail.com" },
				],
				cc: [{ email: "partner@example.com" }],
			},
		];
		const extracted = extractOutboundRecipients(messages, self);
		expect(extracted).toEqual([
			{
				email: "customer@example.com",
				name: "Customer Name",
				photoUrl: undefined,
			},
			{
				email: "partner@example.com",
				name: undefined,
				photoUrl: undefined,
			},
		]);
	});

	it("uses the last non-draft message for direction and separator", () => {
		// Single received message
		expect(
			buildThreadDisplay({
				participants: [{ email: "a@example.com", name: "Danielle" }],
				selfEmailSet: self,
				viewMode: "inbox",
				messages: [
					{
						from: { email: "a@example.com", name: "Danielle" },
						to: [{ email: "user@gmail.com" }],
						sentAt: "1",
					},
				],
			}),
		).toMatchObject({
			direction: "Danielle → me",
			separator: "arrow",
		});

		// Bidirectional conversation where Danielle replied last: "Danielle, me"
		expect(
			buildThreadDisplay({
				participants: [{ email: "a@example.com", name: "Danielle" }],
				selfEmailSet: self,
				viewMode: "inbox",
				messages: [
					{
						from: { email: "user@gmail.com" },
						to: [{ email: "a@example.com", name: "Danielle" }],
						sentAt: "1",
					},
					{
						from: { email: "a@example.com", name: "Danielle" },
						to: [{ email: "user@gmail.com" }],
						sentAt: "2",
					},
					{
						from: { email: "user@gmail.com" },
						to: [{ email: "a@example.com", name: "Danielle" }],
						isDraft: true,
						sentAt: "3",
					},
				],
			}),
		).toMatchObject({
			direction: "Danielle, me",
			separator: "comma",
		});

		// Bidirectional conversation where self replied last: "me → Danielle"
		expect(
			buildThreadDisplay({
				participants: [{ email: "a@example.com", name: "Danielle" }],
				selfEmailSet: self,
				viewMode: "inbox",
				messages: [
					{
						from: { email: "a@example.com", name: "Danielle" },
						to: [{ email: "user@gmail.com" }],
						sentAt: "1",
					},
					{
						from: { email: "user@gmail.com" },
						to: [{ email: "a@example.com", name: "Danielle" }],
						sentAt: "2",
					},
				],
			}),
		).toMatchObject({
			direction: "me → Danielle",
			separator: "arrow",
		});
	});
});

describe("contact avatar policy", () => {
	it("prefers primary, falls back to other, and allows initials fallback", () => {
		const contacts = [
			{ email: "a@example.com", source: "primary" as const },
			{ email: "a@example.com", source: "other" as const, photoUrl: "other" },
		];
		expect(resolveContactAvatar("a@example.com", contacts)).toBe("other");
		expect(
			resolveContactAvatar("missing@example.com", contacts),
		).toBeUndefined();
	});
});
