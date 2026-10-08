import { t } from '@macro/i18n';
import { type ComponentProps, type JSX, Match, Show, Switch } from 'solid-js';
import { SYSTEM_PROPERTY_IDS } from '../identifiers';
import { Property } from '../property';
import { getEntityValues, hasValue } from '../utils';

type PropertyValuePillProps = Pick<
  ComponentProps<typeof Property.Root>,
  'property' | 'canEdit' | 'onSave' | 'onRefresh' | 'onEdit'
> & {
  emptyLabel?: JSX.Element;
  showLabel?: boolean;
  class?: string;
  hoverActions?: JSX.Element;
  entitySelfFilter?: ComponentProps<
    typeof Property.PopoverEditor
  >['entitySelfFilter'];
};

/** Controlled property pill shared by task and project composers. */
export function PropertyValuePill(props: PropertyValuePillProps) {
  const displayName = () =>
    Object.values(SYSTEM_PROPERTY_IDS).some(
      (id) => id === props.property.propertyDefinitionId
    )
      ? t(props.property.displayName)
      : props.property.displayName;
  const isUserEntity = () =>
    props.property.valueType === 'ENTITY' &&
    props.property.specificEntityType === 'USER';
  const isMultiUserEntity = () =>
    isUserEntity() && getEntityValues(props.property).length > 1;

  return (
    <Property.Root
      property={props.property}
      canEdit={props.canEdit}
      onSave={props.onSave}
      onRefresh={props.onRefresh}
      onEdit={props.onEdit}
    >
      <Property.Tooltip property={props.property} actions={props.hoverActions}>
        <Property.Pill class={props.class} variant="outline">
          <Show when={props.showLabel && hasValue(props.property)}>
            <span class="shrink-0 text-ink-muted">{displayName()}:</span>
          </Show>
          <Switch
            fallback={
              <Property.Icon
                property={props.property}
                class="size-3 shrink-0"
              />
            }
          >
            <Match when={isMultiUserEntity()}>
              <Property.UserStack property={props.property} maxUsers={2} />
            </Match>
            <Match when={isUserEntity()}>
              <Property.Icon property={props.property} />
            </Match>
          </Switch>
          <Property.Text
            property={props.property}
            resolveSingleEntity={
              props.showLabel ||
              props.property.specificEntityType === 'INITIATIVE'
            }
            class="min-w-0 max-w-60"
            fallback={
              <Property.Empty label={props.emptyLabel ?? displayName()} />
            }
          />
          <Property.Caret />
        </Property.Pill>
      </Property.Tooltip>
      <Property.PopoverEditor entitySelfFilter={props.entitySelfFilter} />
    </Property.Root>
  );
}
