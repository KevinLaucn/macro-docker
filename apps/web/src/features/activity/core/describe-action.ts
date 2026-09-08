import { t } from '@macro/i18n';
import { match } from 'ts-pattern';
import type { ActivityAction } from './event';

/**
 * Short verb phrase for one activity action, phrased to follow an actor
 * name: "Sarah <created this>". Unknown actions (rows written by a newer
 * deployment) fall back to their humanized raw tag rather than hiding the
 * row.
 */
export function describeAction(action: ActivityAction): string {
  return match(action)
    .with({ kind: 'created' }, () => t('created this'))
    .with({ kind: 'edited' }, () => t('made an edit'))
    .with({ kind: 'opened' }, () => t('opened this'))
    .with({ kind: 'deleted' }, () => t('deleted this'))
    .with({ kind: 'messaged' }, () => t('sent a message'))
    .with({ kind: 'email-sent' }, () => t('sent an email'))
    .with({ kind: 'property-changed' }, () => t('changed a property'))
    .with({ kind: 'participant-added' }, () => t('added a participant'))
    .with({ kind: 'participant-removed' }, () => t('removed a participant'))
    .with({ kind: 'call-started' }, () => t('started a call'))
    .with({ kind: 'unknown' }, (unknown) => unknown.tag.replaceAll('_', ' '))
    .exhaustive();
}

/**
 * The verb for a row that names its entity: "<actor> <verb> [connector]
 * <entity>". Direct-object actions carry no connector ("created *Doc*");
 * located actions carry the natural preposition ("sent a message *in*
 * #general", "changed Status *on* *Doc*").
 */
export function describeActionForEntity(action: ActivityAction): {
  verb: string;
  connector?: string;
} {
  return match(action)
    .with({ kind: 'created' }, () => ({
      verb: t('created'),
    }))
    .with({ kind: 'edited' }, () => ({ verb: t('edited') }))
    .with({ kind: 'opened' }, () => ({ verb: t('opened') }))
    .with({ kind: 'deleted' }, () => ({
      verb: t('deleted'),
    }))
    .with({ kind: 'messaged' }, () => ({
      verb: t('sent a message'),
      connector: t('in'),
    }))
    .with({ kind: 'email-sent' }, () => ({
      verb: t('sent an email'),
      connector: t('in'),
    }))
    .with({ kind: 'property-changed' }, () => ({
      verb: t('changed a property'),
      connector: t('on'),
    }))
    .with({ kind: 'participant-added' }, () => ({
      verb: t('added a participant'),
      connector: t('to'),
    }))
    .with({ kind: 'participant-removed' }, () => ({
      verb: t('removed a participant'),
      connector: t('from'),
    }))
    .with({ kind: 'call-started' }, () => ({
      verb: t('started a call'),
      connector: t('in'),
    }))
    .with({ kind: 'unknown' }, (unknown) => ({
      verb: unknown.tag.replaceAll('_', ' '),
      connector: t('on'),
    }))
    .exhaustive();
}
