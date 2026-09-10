import { createMemo } from 'solid-js';
import type { ChannelCallStatus } from '../ChannelRailItems';

export function useChannelCalls() {
  const callActivity = createMemo(
    () =>
      [] as {
        callId: string;
        channelId: string;
        status: ChannelCallStatus;
      }[]
  );

  const incomingCallIds = createMemo(() => new Map<string, string>());

  const callStatuses = createMemo(() => new Map<string, ChannelCallStatus>());

  return { callActivity, incomingCallIds, callStatuses };
}
