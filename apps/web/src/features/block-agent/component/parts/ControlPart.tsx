/**
 * A control the user issued mid-session: model switch, compaction, stop.
 *
 * The outcome is half the message. A runtime that refuses a control answers
 * with a JSON-RPC error the fold records as `rejected` — most often a model
 * the harness advertised but cannot actually run — and a line that read
 * "Model set to X" either way would be reporting a change that never
 * happened. So each control names all three states, and a rejection carries
 * the runtime's own words.
 */

import { t } from '@macro/i18n';
import type { MessagePart } from '@service-agent-fold/generated/types';
import { match } from 'ts-pattern';
import { ActionLine } from '../../ui';

type ControlPartData = Extract<MessagePart, { kind: 'control' }>;

/** What to call the control, in each of the three outcomes. */
function label(part: ControlPartData): string {
  return (
    match([part.control, part.outcome] as const)
      .with([{ kind: 'set_model' }, { kind: 'pending' }], ([control]) =>
        t('Setting model to {model}…', { model: control.model })
      )
      .with([{ kind: 'set_model' }, { kind: 'accepted' }], ([control]) =>
        t('Model set to {model}', { model: control.model })
      )
      .with([{ kind: 'set_model' }, { kind: 'rejected' }], ([control]) =>
        t("Couldn't switch to {model}", { model: control.model })
      )
      .with([{ kind: 'compact' }, { kind: 'pending' }], () =>
        t('Compacting context…')
      )
      .with([{ kind: 'compact' }, { kind: 'accepted' }], () =>
        t('Context compacted')
      )
      .with([{ kind: 'compact' }, { kind: 'rejected' }], () =>
        t("Couldn't compact the context")
      )
      // A stop is acknowledged the moment it is issued — nothing answers it, so
      // it has no pending state worth naming and cannot be refused.
      .with([{ kind: 'stop' }, { kind: 'rejected' }], () =>
        t("Couldn't stop the agent")
      )
      .with([{ kind: 'stop' }, { kind: 'pending' }], () => t('Stopped'))
      .with([{ kind: 'stop' }, { kind: 'accepted' }], () => t('Stopped'))
      .exhaustive()
  );
}

export function ControlPart(props: { part: ControlPartData }) {
  const rejection = () =>
    props.part.outcome.kind === 'rejected'
      ? props.part.outcome.message
      : undefined;

  return (
    <ActionLine
      label={label(props.part)}
      failed={rejection() !== undefined}
      detail={rejection()}
    />
  );
}
