import { describe, expect, it } from "vitest";
import {
	buildSentDisplay,
	buildThreadDisplay,
	resolveContactAvatar,
	resolveParticipantIdentities,
	resolveSelfEmails,
} from "../index";

const self = resolveSelfEmails([
	{ email_address: "user@gmail.com" },
	{ email_address: " SALES@gmail.com " },
]);

describe("email participant identity", () => {
	it("marks every linked inbox as me and leaves external names distinct", () => {
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
		).toEqual(["me", "me", "Alex", "Alex"]);
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

	it("uses the last non-draft message for direction", () => {
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
			}).direction,
		).toBe("Danielle → me");
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
