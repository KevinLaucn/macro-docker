export type EmailParticipant = {
	email: string;
	name?: string;
	photoUrl?: string;
};

export type EmailViewMode = "inbox" | "sent" | "drafts" | "all";

export type EmailMessage = {
	from?: EmailParticipant;
	to?: EmailParticipant[];
	cc?: EmailParticipant[];
	isDraft?: boolean;
	sentAt?: string;
};

export type ParticipantDisplay = {
	email: string;
	label: string;
	photoUrl?: string;
	isSelf: boolean;
};

export type ContactAvatar = {
	email: string;
	photoUrl?: string;
	source: "primary" | "other";
};
