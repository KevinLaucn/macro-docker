import {
  makeRenameAction,
  useBlockEntityCommands,
} from '@app/features/next-soup/actions';
import { globalSplitManager } from '@app/signal/splitLayout';
import { URL_PARAMS } from '@block-channel/constants';
import { convertTargetMessage } from '@block-channel/utils/target-message';
import { ChannelAttachmentsTab } from '@channel/Attachments/ChannelAttachmentsTab';
import {
  type ChannelHandle,
  type ChannelMessagesStateSnapshot,
  type ChannelProps,
  Channel as NewChannel,
} from '@channel/Channel/Channel';
import {
  ChannelTabProvider,
  useChannelTab,
} from '@channel/Channel/ChannelTabContext';
import { ChannelTopBarLiveIndicators } from '@channel/Channel/ChannelTopBarLiveIndicators';
import {
  CHANNEL_TABS,
  type ChannelTabId,
  DEFAULT_CHANNEL_TAB,
} from '@channel/Channel/channel-tabs';
import {
  URL_PARAMS as CHANNEL_URL_PARAMS,
  isJoinCallRequested,
  isOpenCallTabRequested,
} from '@channel/Channel/link';
import { ChannelParticipantsTab } from '@channel/Participants/ChannelParticipantsTab';
import { SplitFileMenu } from '@components/app/split-layout/components/SplitFileMenu';
import { SplitTitleFileMenu } from '@components/app/split-layout/components/SplitLabel';
import {
  useCanAutofocusSplitContent,
  useSplitPanelOrThrow,
} from '@components/app/split-layout/layoutUtils';
import { useNavigatedFromJK } from '@components/app/useNavigatedFromJK';
import { useBlockId } from '@core/block';
import {
  useChannel,
  useChannelName,
  useChannelType,
} from '@core/context/channels';
import { useUserId } from '@core/context/user';
import { TOKENS } from '@core/hotkey/tokens';
import { isMobile } from '@core/mobile/isMobile';
import { awaitCondition, createMethodRegistration } from '@core/orchestrator';
import { blockHotkeyScopeSignal } from '@core/signal/blockElement';
import { blockHandleSignal } from '@core/signal/load';
import { buildEntityData } from '@entity';
import RenameIcon from '@phosphor/pencil-line.svg';
import {
  fetchResolvedChannelMessage,
  findThreadIdInChannelMessages,
  findTopLevelMessageInChannelMessages,
} from '@queries/channel/channel-messages';
import { useChannelParticipantsQuery } from '@queries/channel/channel-participants';
import { ChannelTypeEnum } from '@service-storage/client';
import { useSearchParams } from '@solidjs/router';
import { cn } from '@ui';
import { createSignal, Match, onCleanup, Suspense, Switch } from 'solid-js';
import { CHANNEL_TAB_ICONS, ChannelTopLeft } from './Top';
import { useChannelBotManagement } from './useChannelBotManagement';

const CHANNEL_STATE_ENTRY_KEY = 'channel.state';

type ChannelTargetMessageParams = {
  [URL_PARAMS.message]?: string;
  [URL_PARAMS.thread]?: string;
  [CHANNEL_URL_PARAMS.joinCall]?: string;
  [CHANNEL_URL_PARAMS.openCallTab]?: string;
};

export type BlockChannelProps = ChannelTargetMessageParams;

type ChannelEntryStateSnapshot = {
  activeTab?: ChannelTabId;
  messages?: ChannelMessagesStateSnapshot;
};

type ChannelPropsTargetMessage = Pick<
  ChannelProps,
  'targetMessageId' | 'targetMessageReplyId'
>;

const normalizeChannelTab = (tab: ChannelTabId) => {
  return tab === 'call' ? DEFAULT_CHANNEL_TAB : tab;
};

const initialChannelTab = (options: { persistedTab?: ChannelTabId }) => {
  return normalizeChannelTab(options.persistedTab ?? DEFAULT_CHANNEL_TAB);
};

function NewTop(props: { channelId: string }) {
  const { activeTab, setActiveTab } = useChannelTab();
  const channelName = useChannelName(props.channelId);
  const channelType = useChannelType(props.channelId);
  const channel = useChannel(props.channelId);
  const userId = useUserId();
  const renameAction = makeRenameAction({ userId });
  const participantsQuery = useChannelParticipantsQuery(() => props.channelId);
  const participants = () =>
    participantsQuery.isLoading ? [] : participantsQuery.data;
  const availableTabs = () => {
    let filtered = [...CHANNEL_TABS];
    if (channelType() === ChannelTypeEnum.DirectMessage)
      filtered = filtered.filter((tab) => tab.value !== 'participants');
    filtered = filtered.filter((tab) => tab.value !== 'call');
    return filtered;
  };
  const tabs = () => availableTabs();

  // The generic rename op is gated on the document block-load signals, which
  // the channel block never sets — so the menu offers a channel-local rename
  // built from the channels context instead. The action's own gate keeps it
  // off DMs and channels the user does not own.
  const channelEntity = () => {
    const ch = channel();
    if (!ch) return undefined;
    return buildEntityData({
      id: props.channelId,
      name: ch.name ?? 'New Channel',
      blockName: 'channel',
      channelType: ch.channel_type,
      ownerId: ch.owner_id,
    });
  };

  // Mobile has no room for inline tabs; the title file-menu drawer leads with
  // them instead, as a titled radio group mirroring the active tab. Built
  // from tabs() so the call tab keeps its live-call label.
  const mobileViews = () => ({
    title: 'View',
    options: tabs().map((tab) => ({
      value: tab.value,
      label: tab.label,
      icon: CHANNEL_TAB_ICONS[tab.value],
    })),
    value: activeTab(),
    onSelect: (value: string) => setActiveTab(value as ChannelTabId),
  });

  return (
    <Suspense>
      <ChannelTopLeft
        channelId={props.channelId}
        channelType={channelType()!}
        participants={participants() ?? []}
        channelName={channelName() ?? 'New Channel'}
        tabs={tabs()}
        activeTab={activeTab()}
        onTabChange={setActiveTab}
      />
      <SplitTitleFileMenu>
        <SplitFileMenu
          id={props.channelId}
          itemType="channel"
          name={channelName() ?? 'New Channel'}
          ops={[]}
          // Generic chrome can't reconstruct a ChannelEntity (it lacks the
          // channelType), so supply it for the menu's entity-gated items.
          entity={channelEntity()}
          mobileViews={isMobile() ? mobileViews() : undefined}
          tools={[
            {
              group: 'file',
              label: 'Rename',
              icon: RenameIcon,
              hotkeyToken: TOKENS.entity.action.rename,
              action: () => {
                const entity = channelEntity();
                if (!entity) return;
                void renameAction.execute([entity]);
              },
              condition: () => {
                const entity = channelEntity();
                return !!entity && renameAction.canExecute(entity);
              },
            },
          ]}
        />
      </SplitTitleFileMenu>
      <ChannelTopBarLiveIndicators />
    </Suspense>
  );
}

export function NewChannelBlockAdapter(props: BlockChannelProps) {
  // Every other block gets its hotkey scope from `BlockContainer`, which the
  // channel block does not render — so set `blockHotkeyScopeSignal` here or
  // `useBlockEntityCommands` would register nothing at all. Commands go on
  // the split scope so they keep working while focus sits on split chrome
  // (header, toolbar, panel div) and across in-split navigation — same as
  // BlockContainer. The adapter requires a split panel, so unlike
  // BlockContainer it needs no fallback DOM scope of its own.
  const splitPanel = useSplitPanelOrThrow();
  blockHotkeyScopeSignal.set(splitPanel.splitHotkeyScope);
  useBlockEntityCommands();
  const canAutofocusSplitContent = useCanAutofocusSplitContent();
  const { navigatedFromJK } = useNavigatedFromJK();
  const channelId = useBlockId();
  const blockHandle = blockHandleSignal.get;
  const [searchParams] = useSearchParams();

  const initialTargetMessageParams = (): ChannelTargetMessageParams => {
    const hasPropsTarget =
      props[URL_PARAMS.message] !== undefined ||
      props[URL_PARAMS.thread] !== undefined;
    if (hasPropsTarget) {
      return {
        [URL_PARAMS.message]: props[URL_PARAMS.message],
        [URL_PARAMS.thread]: props[URL_PARAMS.thread],
      };
    }
    const isSingleSplit = globalSplitManager()?.splits().length === 1;
    if (!isSingleSplit) return {};
    return {
      [URL_PARAMS.message]: searchParams[URL_PARAMS.message] as
        | string
        | undefined,
      [URL_PARAMS.thread]: searchParams[URL_PARAMS.thread] as
        | string
        | undefined,
    };
  };

  const persistedChannelState = splitPanel.handle.currentEntryState()?.[
    CHANNEL_STATE_ENTRY_KEY
  ] as ChannelEntryStateSnapshot | undefined;

  const hasInitialTargetRequest = () => {
    const hasPropsTarget =
      props[URL_PARAMS.message] !== undefined ||
      props[URL_PARAMS.thread] !== undefined;
    if (hasPropsTarget) return true;

    const isSingleSplit = globalSplitManager()?.splits().length === 1;
    if (!isSingleSplit) return false;

    return (
      searchParams[URL_PARAMS.message] !== undefined ||
      searchParams[URL_PARAMS.thread] !== undefined
    );
  };

  const shouldHydratePersistedChannelState =
    !isOpenCallTabRequested(props[CHANNEL_URL_PARAMS.openCallTab]) &&
    !isOpenCallTabRequested(searchParams[CHANNEL_URL_PARAMS.openCallTab]) &&
    !hasInitialTargetRequest();

  const [activeTab, setActiveTabInternal] = createSignal<ChannelTabId>(
    initialChannelTab({
      persistedTab: shouldHydratePersistedChannelState
        ? persistedChannelState?.activeTab
        : undefined,
    })
  );

  // Set when `<NewChannel>` mounts (Messages tab only); used for goToMessage.
  // A signal so goToLocationFromParams can await it via the orchestrator's
  // availability primitive when the tab hasn't mounted yet.
  const [messagesHandle, setMessagesHandle] = createSignal<ChannelHandle>();
  let lastMessagesStateSnapshot = persistedChannelState?.messages;

  const setActiveTab = (tab: ChannelTabId) => {
    tab = normalizeChannelTab(tab);
    if (tab !== 'messages') {
      setMessagesHandle(undefined);
    }
    setActiveTabInternal(tab);
  };

  const botManagement = useChannelBotManagement({
    channelId,
    hotkeyScopeId: splitPanel.splitHotkeyScope,
    openParticipants: () => setActiveTab('participants'),
  });

  // A mention/link to a thread reply may carry only the message id (the reply)
  // without its thread id. Left as-is `convertTargetMessage` would treat that
  // reply as a top-level message, which never loads, so the target is never
  // highlighted. When only a message id is present, resolve it: a thread reply
  // targets its parent thread with the reply id, a top-level message stays as
  // itself. An explicit thread id is already unambiguous, so trust it.
  const resolveTargetMessage = async (
    params: ChannelTargetMessageParams
  ): Promise<ChannelPropsTargetMessage> => {
    const messageId = params[URL_PARAMS.message] as string | undefined;
    const threadId = params[URL_PARAMS.thread] as string | undefined;
    if (threadId || !messageId) return convertTargetMessage(params);

    // Cache-first: an already-open channel has the clicked message warm, so a
    // plain send (the common inbox-row click) or a reply in a loaded thread
    // preview resolves synchronously with no roundtrip. Only a genuinely
    // unknown id — an old mention/link opening a cold channel — pays a resolve.
    if (findTopLevelMessageInChannelMessages(channelId, messageId)) {
      return { targetMessageId: messageId, targetMessageReplyId: undefined };
    }
    const cachedThreadId = findThreadIdInChannelMessages(channelId, messageId);
    if (cachedThreadId) {
      return {
        targetMessageId: cachedThreadId,
        targetMessageReplyId: messageId,
      };
    }

    const resolved = await fetchResolvedChannelMessage(
      channelId,
      messageId
    ).catch(() => undefined);
    if (resolved?.kind === 'threadReply') {
      return {
        targetMessageId: resolved.thread_id,
        targetMessageReplyId: messageId,
      };
    }
    return { targetMessageId: messageId, targetMessageReplyId: undefined };
  };

  // The Messages tab may not have mounted yet (e.g. right after the split
  // opens). Wait for its handle via the orchestrator's availability primitive.
  const awaitMessagesHandle = async () => {
    await awaitCondition(() => messagesHandle() !== undefined, 10_000).catch(
      () => {}
    );
    return messagesHandle();
  };

  // Register on the block always — `goToLocationFromParams` used to live only
  // inside `onChannelReady` (Messages tab), so open-call from Attachments/etc. was a no-op.
  createMethodRegistration(blockHandle, {
    goToLocationFromParams: async (params: ChannelTargetMessageParams) => {
      if (isOpenCallTabRequested(params[CHANNEL_URL_PARAMS.openCallTab])) {
        setActiveTab(DEFAULT_CHANNEL_TAB);
        return;
      }

      const { targetMessageId, targetMessageReplyId } =
        await resolveTargetMessage(params);

      if (targetMessageId) {
        setActiveTab(DEFAULT_CHANNEL_TAB);
        const handle = await awaitMessagesHandle();
        handle?.goToMessage(targetMessageId, targetMessageReplyId);
      }

      if (isJoinCallRequested(params[CHANNEL_URL_PARAMS.joinCall])) {
        setActiveTab(DEFAULT_CHANNEL_TAB);
      }
    },
    goToLatest: async () => {
      setActiveTab(DEFAULT_CHANNEL_TAB);
      const handle = await awaitMessagesHandle();
      handle?.goToLatest();
    },
  });

  const onChannelReady = (handle: ChannelHandle) => {
    setMessagesHandle(() => handle);
  };

  const disposeChannelStateCaptor = splitPanel.handle.registerEntryStateCaptor(
    CHANNEL_STATE_ENTRY_KEY,
    (): ChannelEntryStateSnapshot => {
      const handle = messagesHandle();
      const messages = handle
        ? handle.getMessagesStateSnapshot()
        : lastMessagesStateSnapshot;
      lastMessagesStateSnapshot = messages;
      return {
        activeTab: activeTab(),
        messages,
      };
    }
  );
  onCleanup(disposeChannelStateCaptor);

  const initialMessagesStateSnapshot = () =>
    shouldHydratePersistedChannelState
      ? persistedChannelState?.messages
      : undefined;

  return (
    <>
      <ChannelTabProvider activeTab={activeTab} setActiveTab={setActiveTab}>
        <div
          class={cn(
            'h-full flex flex-col px-2 touch:px-0',
            // The channel block is full-frame on mobile (messages scroll
            // behind the chrome); the other tabs still need to start below
            // the status bar + floating header.
            activeTab() !== 'messages' &&
              'touch:pt-(--mobile-content-inset-top)'
          )}
        >
          <Switch>
            <Match when={activeTab() === 'messages'}>
              <NewChannel
                channelId={channelId}
                onHandleReady={onChannelReady}
                autofocus={canAutofocusSplitContent && !navigatedFromJK()}
                initialMessagesStateSnapshot={initialMessagesStateSnapshot()}
                {...convertTargetMessage(initialTargetMessageParams())}
              />
            </Match>
            <Match when={activeTab() === 'attachments'}>
              <ChannelAttachmentsTab channelId={channelId} />
            </Match>
            <Match when={activeTab() === 'participants'}>
              <ChannelParticipantsTab
                channelId={channelId}
                botManagementEnabled={botManagement.enabled()}
                onCreateBot={botManagement.openCreateBot}
                inviteBotFocusRequest={botManagement.inviteFocusRequest()}
                onOpenBot={botManagement.openBot}
              />
            </Match>
          </Switch>
          <NewTop channelId={channelId} />
        </div>
      </ChannelTabProvider>
    </>
  );
}
