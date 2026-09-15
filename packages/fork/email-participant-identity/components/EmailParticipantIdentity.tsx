import type { JSX } from "solid-js";
import { Show } from "solid-js";
import type { EmailParticipant } from "../types";
import { participantLabel } from "../identity/participant-identity";

export function EmailParticipantIdentity(props: {
	participant: EmailParticipant;
	selfEmailSet: ReadonlySet<string>;
	highlighted?: string;
	label?: string;
	avatar?: JSX.Element;
}) {
	const identity = () =>
		participantLabel(props.participant, props.selfEmailSet);

	return (
		<span class="inline-flex items-center gap-1">
			{props.avatar}
			<Show
				when={props.highlighted}
				fallback={
					<span class={identity().isSelf ? "text-accent" : undefined}>
						{props.label ?? identity().label}
					</span>
				}
			>
				{(highlighted) => <span>{highlighted()}</span>}
			</Show>
		</span>
	);
}
