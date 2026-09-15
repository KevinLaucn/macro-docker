import type { JSX } from "solid-js";
import { Show } from "solid-js";
import type { EmailParticipant } from "../types";

export function EmailParticipantIdentity(props: {
	participant: EmailParticipant;
	selfEmailSet: ReadonlySet<string>;
	highlighted?: string;
	label?: string;
	avatar?: JSX.Element;
}) {
	return (
		<span class="inline-flex items-center gap-1">
			{props.avatar}
			<Show
				when={props.highlighted}
				fallback={
						<span>
							{props.label ??
								props.participant.name?.trim() ??
								props.participant.email.split("@")[0]}
					</span>
				}
			>
				{(highlighted) => <span>{highlighted()}</span>}
			</Show>
		</span>
	);
}
