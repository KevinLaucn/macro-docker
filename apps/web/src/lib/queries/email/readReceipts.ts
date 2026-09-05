import { throwOnErr } from '@core/util/result';
import {
  type ReadReceiptStatus,
  readReceiptsClient,
} from '@service-email/readReceiptsClient';
import { useMutation, useQuery } from '@tanstack/solid-query';
import type { Accessor } from 'solid-js';

export function useReadReceiptStatusQuery(
  messageId: Accessor<string>,
  enabled: Accessor<boolean>
) {
  return useQuery(() => ({
    queryKey: ['email', 'read-receipt', messageId()],
    queryFn: async (): Promise<ReadReceiptStatus> => {
      const response = await throwOnErr(() =>
        readReceiptsClient.getStatuses([messageId()])
      );
      return (
        response.statuses[0] ?? {
          message_id: messageId(),
          first_opened_at: null,
          last_opened_at: null,
          open_count: 0,
        }
      );
    },
    enabled: enabled(),
    staleTime: 10_000,
    // Keep an open sent message fresh enough for the Seen indicator to appear
    // without a manual thread refresh.
    refetchInterval: 30_000,
  }));
}

export function useReadReceiptsPreferenceQuery(
  linkId: Accessor<string | undefined>
) {
  return useQuery(() => ({
    queryKey: ['email', 'read-receipts-preference', linkId()],
    queryFn: async () =>
      throwOnErr(() => readReceiptsClient.getPreference(linkId())),
    enabled: Boolean(linkId()),
    staleTime: 30_000,
  }));
}

export function useSetReadReceiptsPreferenceMutation(
  linkId: Accessor<string | undefined>
) {
  return useMutation(() => ({
    mutationFn: async (enabled: boolean) =>
      throwOnErr(() => readReceiptsClient.setPreference(enabled, linkId())),
  }));
}
