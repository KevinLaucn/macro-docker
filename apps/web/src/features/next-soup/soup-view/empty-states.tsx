import { DOCS_BASE } from '@app/constants/docs-links';
import type { ListView } from '@app/constants/list-views';
import {
  type CreatableName,
  runCreateAction,
  useCreatableEnabled,
} from '@app/features/command/Launcher';
import { openNewChannelModal } from '@channel/CreateChannelModal';
import { useSettingsState } from '@core/constant/SettingsState';
import { useAddInboxFlow, useEmailLinksStatus } from '@core/email-link';
import EmptyStateAiGraphic from '@design/empty-state-ai.svg';
import EmptyStateAutomationsGraphic from '@design/empty-state-automations.svg';
import EmptyStateCallsGraphic from '@design/empty-state-calls.svg';
import EmptyStateChannelsGraphic from '@design/empty-state-channels.svg';
import EmptyStateCompaniesGraphic from '@design/empty-state-companies.svg';
import EmptyStateDocGraphic from '@design/empty-state-doc.svg';
import EmptyStateEmailGraphic from '@design/empty-state-email.svg';
import EmptyStateFolderGraphic from '@design/empty-state-folder.svg';
import EmptyStateInboxTrayGraphic from '@design/empty-state-inbox-tray.svg';
import EmptyStateInboxZeroGraphic from '@design/empty-state-inbox-zero.svg';
import EmptyStateNoFilterMatchGraphic from '@design/empty-state-no-filter-match.svg';
import EmptyStateNoSearchMatchGraphic from '@design/empty-state-no-search-match.svg';
import EmptyStateTasksGraphic from '@design/empty-state-tasks.svg';
import { t } from '@macro/i18n';
import PlusIcon from '@phosphor/plus.svg';
import { useCurrentTeamQuery, useIsTeamAdmin } from '@queries/team/teams';
import { EmptyStatePanel, FilteredHiddenBanner } from '@ui';
import { type Component, type JSXElement, Match, Switch } from 'solid-js';
import { FolderDropZone } from './FolderDropZone';
import { useSoupView } from './soup-view-context';

/** A single key, sized to sit inline in a sentence rather than on its own row. */
function HotkeyCap(props: { children: JSXElement }) {
  return (
    <kbd class="rounded border border-edge-muted px-1 py-px font-mono text-xs">
      {props.children}
    </kbd>
  );
}

type FallbackContent = {
  plural: string;
  graphic?: Component<{ class?: string }>;
  description?: JSXElement;
  create?: { label: string; blockName: CreatableName };
  documentationUrl?: string;
};

/** Whether a failed request has no trustworthy local result to render. */
export function shouldShowLoadError(options: {
  hasData: boolean;
  forceEmptyState: boolean;
}): boolean {
  return !options.hasData && !options.forceEmptyState;
}

const FALLBACK_CONTENT: Partial<Record<ListView, FallbackContent>> = {
  documents: {
    plural: 'documents',
    graphic: EmptyStateDocGraphic,
    description: t(
      'Write, collaborate, and share documents right inside Macro. Create notes, specs, or any long-form content and keep it alongside your conversations.'
    ),
    create: { label: 'New document', blockName: 'md' },
    documentationUrl: `${DOCS_BASE}/product/docs`,
  },
  channels: {
    plural: 'channels',
    graphic: EmptyStateChannelsGraphic,
    description: t(
      'Channels are shared spaces for team conversations organized by topic, project, or team. Create a channel to start collaborating with your team.'
    ),
    create: { label: 'New channel', blockName: 'channel' },
    documentationUrl: `${DOCS_BASE}/product/channels`,
  },
  reminders: {
    plural: 'reminders',
    description: (
      <>
        {t(
          'Set a reminder on anything in Macro by selecting it and pressing {key}, or write one about nothing in particular from the Create menu.',
          { key: '__KEY__' }
        )
          .split('__KEY__')
          .reduce<JSXElement[]>(
            (acc, part, idx) =>
              idx === 0 ? [part] : [...acc, <HotkeyCap>h</HotkeyCap>, part],
            []
          )}
      </>
    ),
    create: { label: 'New reminder', blockName: 'reminder' },
  },
  calls: {
    plural: 'calls',
    graphic: EmptyStateCallsGraphic,
    description: (
      <>
        {t('See recordings, transcriptions and summaries of your Macro calls.')}
        <br />
        {t('Calls are available to agents.')}
      </>
    ),
    documentationUrl: `${DOCS_BASE}/product/calls`,
  },
};

export function EmptyState(props: {
  listView?: ListView;
  search?: boolean;
  hasRefinementsFromBase?: boolean;
  hasHiddenItems?: boolean;
  onClearFilters?: () => void;
}) {
  const emailActive = useEmailLinksStatus();
  const startAddInbox = useAddInboxFlow();
  const soup = useSoupView();
  const teamQuery = useCurrentTeamQuery();
  const isCreatableEnabled = useCreatableEnabled();
  const isTeamAdmin = useIsTeamAdmin();
  const { openSettings } = useSettingsState();

  // CRM is disabled by default per team; the companies list has a dedicated
  // empty state that points admins to the toggle in Settings › CRM. A user
  // with no team at all (data resolves to null) is pointed to team settings
  // instead, since CRM can only be enabled on a team. Branches wait for the
  // query to resolve so enabled teams don't flash the disabled copy.
  const teamResolved = () => teamQuery.data !== undefined;
  const crmEnabled = () => teamQuery.data?.team.crm_enabled ?? false;
  const hasNoTeam = () => teamQuery.data === null;

  const onConnectEmail = () => {
    void startAddInbox();
  };

  return (
    <Switch>
      <Match when={props.search}>
        <EmptyStatePanel
          centered
          graphic={EmptyStateNoSearchMatchGraphic}
          title={
            soup.searchText().trim().length > 0
              ? t('No results for "{query}"', { query: soup.searchText() })
              : t('No results')
          }
          description={t(
            'Search across messages, documents, tasks, and more. Try a different query or broaden your filters.'
          )}
          documentationUrl={`${DOCS_BASE}/product/search`}
        />
      </Match>

      <Match when={props.hasRefinementsFromBase}>
        <EmptyStatePanel
          centered
          graphic={EmptyStateNoFilterMatchGraphic}
          title={t('No items matching the filters')}
          description={t(
            'Try adjusting or clearing your filters to see more results.'
          )}
        >
          {props.onClearFilters && (
            <FilteredHiddenBanner
              hasHiddenItems={false}
              onClearFilters={props.onClearFilters}
            />
          )}
        </EmptyStatePanel>
      </Match>

      {/* The Reminders tab is not an email surface, so it sits above the
          connect-email gate — its empty copy is the same with or without a
          linked inbox. */}
      <Match
        when={props.listView === 'inbox' && soup.activeTab() === 'reminders'}
      >
        <EmptyStatePanel
          graphic={EmptyStateInboxTrayGraphic}
          title={t('No scheduled reminders')}
          description={t(
            'Reminders you schedule wait here until they fire into Signal. Set one on anything in Macro by selecting it and pressing {key}, or write one about nothing in particular.',
            { key: '__KEY__' }
          )
            .split('__KEY__')
            .reduce<JSXElement[]>(
              (acc, part, idx) =>
                idx === 0 ? [part] : [...acc, <HotkeyCap>h</HotkeyCap>, part],
              []
            )}
          // Gated like every other reminder affordance. The tab itself is
          // already hidden when the flag is off, so this is belt and braces
          // rather than the only thing standing in the way.
          primaryAction={
            isCreatableEnabled('reminder')
              ? {
                  label: t('New reminder'),
                  onClick: () => runCreateAction('reminder'),
                }
              : undefined
          }
          documentationUrl={`${DOCS_BASE}/product/inbox`}
        />
      </Match>

      <Match when={props.listView === 'inbox' && !emailActive()}>
        <EmptyStatePanel
          graphic={EmptyStateInboxTrayGraphic}
          title={t('Your inbox is empty')}
          description={t(
            'Bring your inbox into Macro to triage signal from noise, reply faster, and let agents work alongside your mail.'
          )}
          primaryAction={{
            label: t('Connect email'),
            onClick: onConnectEmail,
          }}
          documentationUrl={`${DOCS_BASE}/product/inbox`}
        />
      </Match>

      <Match when={props.listView === 'mail' && !emailActive()}>
        <EmptyStatePanel
          graphic={EmptyStateEmailGraphic}
          title={t('Connect your email')}
          description={t(
            'Bring your inbox into Macro to triage signal from noise, reply faster, and let agents work alongside your mail.'
          )}
          primaryAction={{
            label: t('Connect email'),
            onClick: onConnectEmail,
          }}
          documentationUrl={`${DOCS_BASE}/product/email`}
        />
      </Match>

      <Match when={props.listView === 'inbox' && emailActive()}>
        {(() => {
          // Each inbox tab filters to a different slice, so the empty copy
          // should match: Signal is the important stuff, Noise is explicitly
          // the low-priority stuff, and All spans everything.
          const tab = soup.activeTab();
          const { title, description } =
            tab === 'noise'
              ? {
                  title: t('No noise'),
                  description: (
                    <>
                      {t(
                        'Low-priority items like newsletters and notifications collect here.'
                      )}
                      <br />
                      {t('Nothing to clear right now.')}
                    </>
                  ),
                }
              : tab === 'all'
                ? {
                    title: t('Inbox zero'),
                    description: t(
                      "You're all caught up. New items will appear here as they arrive."
                    ),
                  }
                : {
                    title: t('Inbox zero'),
                    description: t(
                      "You're all caught up. Important items will appear here as they arrive."
                    ),
                  };
          return (
            <EmptyStatePanel
              graphic={EmptyStateInboxTrayGraphic}
              title={title}
              description={description}
              documentationUrl={`${DOCS_BASE}/product/inbox`}
            />
          );
        })()}
      </Match>

      <Match when={props.listView === 'mail' && emailActive()}>
        <EmptyStatePanel
          graphic={EmptyStateInboxTrayGraphic}
          title={t('Inbox zero')}
          description={t(
            "You're all caught up. New email will appear here as it arrives."
          )}
          documentationUrl={`${DOCS_BASE}/product/email`}
        />
      </Match>

      <Match when={props.listView === 'tasks'}>
        <EmptyStatePanel
          graphic={EmptyStateTasksGraphic}
          title={t('Nothing to do')}
          description={t(
            'Tasks you create or that get assigned to you will show up here.'
          )}
          primaryAction={{
            label: t('New task'),
            icon: PlusIcon,
            onClick: () => runCreateAction('task'),
          }}
          documentationUrl={`${DOCS_BASE}/product/tasks`}
        />
      </Match>

      <Match
        when={props.listView === 'agents' && soup.activeTab() === 'automations'}
      >
        <EmptyStatePanel
          graphic={EmptyStateAutomationsGraphic}
          title={t('No automations to show')}
          description={t(
            'Automations run in the background to handle repetitive work for you — like triaging messages, updating tasks, or sending follow-ups.'
          )}
          primaryAction={{
            label: t('New automation'),
            icon: PlusIcon,
            onClick: () => runCreateAction('automation'),
          }}
          documentationUrl={`${DOCS_BASE}/product/agents`}
        />
      </Match>

      <Match
        when={props.listView === 'agents' && soup.activeTab() === 'skills'}
      >
        <EmptyStatePanel
          graphic={EmptyStateAiGraphic}
          title={t('No skills yet')}
          description={t(
            'Skills are markdown documents with instructions AI follows. Reference one with / in any AI input.'
          )}
          primaryAction={{
            label: t('New skill'),
            icon: PlusIcon,
            onClick: () => runCreateAction('skill'),
          }}
          documentationUrl={`${DOCS_BASE}/product/agents`}
        />
      </Match>

      <Match when={props.listView === 'agents'}>
        <EmptyStatePanel
          graphic={EmptyStateAiGraphic}
          title={t('Get started with agents')}
          description={t(
            'Create an agent, or use Macro with your favorite AI chat client or code editor via MCP.'
          )}
          primaryAction={{
            label: t('New agent'),
            icon: PlusIcon,
            onClick: () => runCreateAction('chat'),
          }}
          documentationUrl={`${DOCS_BASE}/product/agents`}
        />
      </Match>

      <Match when={props.listView === 'companies'}>
        <Switch>
          {/* Render nothing until the team query resolves — showing a wrong
              panel for a moment is worse than a brief blank. */}
          <Match when={!teamResolved()}>{null}</Match>
          <Match when={hasNoTeam()}>
            <EmptyStatePanel
              centered
              graphic={EmptyStateCompaniesGraphic}
              title={t('Join a team to enable CRM')}
              description={t('Create or join a team in Settings > Team.')}
              primaryAction={{
                label: t('Open team settings'),
                onClick: () => openSettings('Team'),
              }}
            />
          </Match>
          <Match when={!crmEnabled()}>
            <EmptyStatePanel
              centered
              graphic={EmptyStateCompaniesGraphic}
              title={t('CRM is disabled')}
              description={
                isTeamAdmin()
                  ? t(
                      'Enable CRM in Settings > CRM to start tracking your customers.'
                    )
                  : t(
                      'Team owners and admins can enable CRM in Settings > CRM.'
                    )
              }
              primaryAction={
                isTeamAdmin()
                  ? {
                      label: t('Open CRM settings'),
                      onClick: () => openSettings('CRM'),
                    }
                  : undefined
              }
            />
          </Match>
          <Match when={true}>
            <EmptyStatePanel
              graphic={EmptyStateCompaniesGraphic}
              title={t('No customers yet')}
              description={t('Customers your team emails will appear here.')}
            />
          </Match>
        </Switch>
      </Match>

      <Match
        when={
          props.listView === 'folders' ||
          // The Files split (the `documents` list view) surfaces folders under
          // its own Folders tab, so honor that tab here too — otherwise it
          // would fall through to the generic "No documents" fallback.
          (props.listView === 'documents' && soup.activeTab() === 'folders')
        }
      >
        <EmptyStatePanel
          graphic={EmptyStateFolderGraphic}
          title={t('No folders')}
          description={t(
            'Folders let you organize conversations, documents, and tasks into projects. Create a folder or drop files below to get started.'
          )}
          primaryAction={{
            label: t('New folder'),
            icon: PlusIcon,
            onClick: () => runCreateAction('project'),
          }}
          documentationUrl={`${DOCS_BASE}/product/folders`}
        >
          <FolderDropZone />
        </EmptyStatePanel>
      </Match>

      <Match when={props.listView === 'search'}>
        <EmptyStatePanel
          centered
          graphic={EmptyStateNoSearchMatchGraphic}
          title={t('No items to show')}
          description={t('Search across messages, documents, tasks, and more.')}
          documentationUrl={`${DOCS_BASE}/product/search`}
        />
      </Match>

      <Match when={true}>
        {(() => {
          const fallback = (props.listView &&
            FALLBACK_CONTENT[props.listView]) ?? {
            plural: 'items',
          };
          // A gated creatable is not offered here either. Nothing else stops
          // this button: a view can be reachable while the thing it creates is
          // flagged off, and `runCreateAction` would then decline the click.
          const createAction = () => {
            const create = fallback.create;
            if (!create || !isCreatableEnabled(create.blockName)) {
              return undefined;
            }
            return {
              label: t(create.label),
              icon: PlusIcon,
              onClick: () => {
                if (props.listView === 'channels') {
                  openNewChannelModal();
                  return;
                }
                runCreateAction(create.blockName);
              },
            };
          };
          return (
            <EmptyStatePanel
              graphic={fallback.graphic ?? EmptyStateInboxZeroGraphic}
              title={t('No {item} to show', { item: t(fallback.plural) })}
              description={fallback.description}
              primaryAction={createAction()}
              documentationUrl={fallback.documentationUrl}
            />
          );
        })()}
      </Match>
    </Switch>
  );
}
