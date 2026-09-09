/** A permission request, with the outcome (chosen option) as trailing text. */

import type { MessagePart } from '@service-agent-fold/generated/types';
import { t } from '@macro/i18n';
import { Show } from 'solid-js';
import { ToolCard } from '../../ui';

export function PermissionPart(props: {
  part: Extract<MessagePart, { kind: 'permission' }>;
}) {
  const outcome = () => {
    const resolved = props.part.outcome;
    if (!resolved || resolved.kind === 'pending') return undefined;
    if (resolved.kind === 'cancelled') return t('Cancelled');
    if (resolved.kind === 'errored') return t('Failed');
    if (resolved.kind === 'unrecognized') return t('Answered');
    const chosen = props.part.options.find(
      (option) => option.id === resolved.optionId
    );
    return chosen?.name ?? t('Answered');
  };

  return (
    <ToolCard
      title={t('Permission requested')}
      trailing={
        <Show when={outcome()}>
          {(label) => <span class="text-ink">{label()}</span>}
        </Show>
      }
      status="completed"
    />
  );
}
