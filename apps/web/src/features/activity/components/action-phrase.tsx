import type { PropertyDefinitionDomain } from '@property/types';
import { t } from '@macro/i18n';
import { Show } from 'solid-js';
import { describeAction } from '../core/describe-action';
import type { ActivityAction } from '../core/event';
import { PropertyChangeText } from './property-change';

function capitalize(value: string): string {
  return value.length === 0 ? value : value[0].toUpperCase() + value.slice(1);
}

function localizeAction(action: ActivityAction, count = 1): string {
  if (count < 2) {
    const phrase = describeAction(action, count);
    return t(phrase);
  }
  const keyByKind: Record<ActivityAction['kind'], string> = {
    created: 'created this {count} times',
    edited: 'made {count} edits',
    opened: 'opened this {count} times',
    deleted: 'deleted this {count} times',
    messaged: 'sent {count} messages',
    'email-sent': 'sent {count} emails',
    'property-changed': 'made {count} property changes',
    'participant-added': 'added {count} participants',
    'participant-removed': 'removed {count} participants',
    'call-started': 'started {count} calls',
    unknown: 'unknown activity {count} times',
  };
  return t(keyByKind[action.kind], { count });
}

/**
 * The verb half of an activity row: property changes render their resolved
 * transition ("changed Status from … to …"), everything else the plain verb
 * phrase with the run `count` folded in ("made 5 edits").
 */
export function ActionPhrase(props: {
  action: ActivityAction;
  count?: number;
  propertyDefinition?: PropertyDefinitionDomain;
  capitalize?: boolean;
}) {
  return (
    <Show
      when={props.action.kind === 'property-changed' ? props.action : undefined}
      fallback={
        props.capitalize
          ? capitalize(localizeAction(props.action, props.count))
          : localizeAction(props.action, props.count)
      }
    >
      {(change) => (
        <PropertyChangeText
          action={change()}
          definition={props.propertyDefinition}
          capitalize={props.capitalize}
        />
      )}
    </Show>
  );
}
