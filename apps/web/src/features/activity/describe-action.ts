import { t } from '@macro/i18n';
import type { ActivityEvent } from '@queries/activity/graphql/entity';
import { match } from 'ts-pattern';

type ActivityAction = ActivityEvent['action'];

/**
 * Narrows an action to its property-change member, for rows that render
 * the richer "changed X from A to B" phrase instead of [`describeAction`].
 */
export function actionAsPropertyChange(
  action: ActivityAction
):
  | Extract<ActivityAction, { __typename: 'GraphqlActivityPropertyChanged' }>
  | undefined {
  return action.__typename === 'GraphqlActivityPropertyChanged'
    ? action
    : undefined;
}

/**
 * Short verb phrase for one activity action, phrased to follow an actor
 * name: "Sarah <created this>". Unknown actions (rows written by a newer
 * deployment) fall back to their humanized raw tag rather than hiding the
 * row.
 */
export function describeAction(action: ActivityAction): string {
  return match(action)
    .with({ __typename: 'GraphqlActivityCreated' }, () => t('created this'))
    .with({ __typename: 'GraphqlActivityEdited' }, () => t('made an edit'))
    .with({ __typename: 'GraphqlActivityOpened' }, () => t('opened this'))
    .with({ __typename: 'GraphqlActivityDeleted' }, () => t('deleted this'))
    .with({ __typename: 'GraphqlActivityMessaged' }, () => t('sent a message'))
    .with({ __typename: 'GraphqlActivitySent' }, () => t('sent an email'))
    .with({ __typename: 'GraphqlActivityPropertyChanged' }, () =>
      t('changed a property')
    )
    .with({ __typename: 'GraphqlActivityParticipantAdded' }, () =>
      t('added a participant')
    )
    .with({ __typename: 'GraphqlActivityParticipantRemoved' }, () =>
      t('removed a participant')
    )
    .with({ __typename: 'GraphqlActivityCallStarted' }, () =>
      t('started a call')
    )
    .with({ __typename: 'GraphqlActivityUnknownAction' }, (unknown) =>
      unknown.tag.replaceAll('_', ' ')
    )
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
  return (
    match(action)
      .with({ __typename: 'GraphqlActivityCreated' }, () => ({
        verb: t('created'),
      }))
      .with({ __typename: 'GraphqlActivityEdited' }, () => ({
        verb: t('edited'),
      }))
      .with({ __typename: 'GraphqlActivityOpened' }, () => ({
        verb: t('opened'),
      }))
      .with({ __typename: 'GraphqlActivityDeleted' }, () => ({
        verb: t('deleted'),
      }))
      .with({ __typename: 'GraphqlActivityMessaged' }, () => ({
        verb: t('sent a message'),
        connector: t('in'),
      }))
      .with({ __typename: 'GraphqlActivitySent' }, () => ({
        verb: t('sent an email'),
        connector: t('in'),
      }))
      // The caller renders the full transition phrase; only the connector
      // is needed for property changes.
      .with({ __typename: 'GraphqlActivityPropertyChanged' }, () => ({
        verb: t('changed a property'),
        connector: t('on'),
      }))
      .with({ __typename: 'GraphqlActivityParticipantAdded' }, () => ({
        verb: t('added a participant'),
        connector: t('to'),
      }))
      .with({ __typename: 'GraphqlActivityParticipantRemoved' }, () => ({
        verb: t('removed a participant'),
        connector: t('from'),
      }))
      .with({ __typename: 'GraphqlActivityCallStarted' }, () => ({
        verb: t('started a call'),
        connector: t('in'),
      }))
      .with({ __typename: 'GraphqlActivityUnknownAction' }, (unknown) => ({
        verb: unknown.tag.replaceAll('_', ' '),
        connector: t('on'),
      }))
      .exhaustive()
  );
}
