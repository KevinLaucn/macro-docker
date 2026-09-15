import type { JSX } from "solid-js";
import { Show } from "solid-js";
import { isSelfEmail } from "../identity/participant-identity";
import type { EmailParticipant } from "../types";

export function EmailParticipantIdentity(props: {
	participant: EmailParticipant;
	selfEmailSet: ReadonlySet<string>;
	highlighted?: string;
	label?: string;
	avatar?: JSX.Element;
}) {
	const isSelf = () => isSelfEmail(props.participant.email, props.selfEmailSet);
	const className = () => (isSelf() ? "text-accent" : undefined);

	return (
		<span class="inline-flex items-center gap-1">
			{props.avatar}
			<Show
				when={props.highlighted}
				fallback={
					<span class={className()}>
						{props.label ??
							props.participant.name?.trim() ??
							props.participant.email.split("@")[0]}
					</span>
				}
			>
				{(highlighted) => (
					<span class={className()}>{highlighted()}</span>
				)}
			</Show>
		</span>
	);
}
