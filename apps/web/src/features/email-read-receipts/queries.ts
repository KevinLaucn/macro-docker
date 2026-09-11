import { throwOnErr } from '@core/util/result';
import {
  type QueryClient,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/solid-query';
import type { Accessor } from 'solid-js';
import {
  type GlobalExtensionSettingsResponse,
  type ReadReceiptStatusData,
  readReceiptsClient,
} from './client';

interface PendingBatchRequest {
  resolve: (data: ReadReceiptStatusData) => void;
  reject: (err: unknown) => void;
}

let pendingBatch: Map<string, PendingBatchRequest[]> = new Map();
let batchScheduled = false;

export const MAX_STATUS_BATCH_CHUNK = 100;

export function flushReadReceiptStatusBatch(queryClient?: QueryClient): void {
  const currentBatch = pendingBatch;
  pendingBatch = new Map();
  batchScheduled = false;

  const ids = Array.from(currentBatch.keys());
  if (ids.length === 0) return;

  for (let i = 0; i < ids.length; i += MAX_STATUS_BATCH_CHUNK) {
    const chunkIds = ids.slice(i, i + MAX_STATUS_BATCH_CHUNK);
    readReceiptsClient
      .getStatuses(chunkIds)
      .then((res) => {
        const statuses = res.statuses || [];
        const statusMap = new Map<string, ReadReceiptStatusData>();
        for (const s of statuses) {
          statusMap.set(s.message_id, s);
        }

        for (const id of chunkIds) {
          const status = statusMap.get(id) ?? {
            message_id: id,
            first_opened_at: null,
            last_opened_at: null,
            open_count: 0,
          };
          if (queryClient) {
            queryClient.setQueryData(['email', 'read-receipt', id], status);
          }
          const callbacks = currentBatch.get(id) ?? [];
          for (const cb of callbacks) {
            cb.resolve(status);
          }
        }
      })
      .catch((err) => {
        for (const id of chunkIds) {
          const callbacks = currentBatch.get(id) ?? [];
          for (const cb of callbacks) {
            cb.reject(err);
          }
        }
      });
  }
}

export function fetchReadReceiptStatusBatched(
  messageId: string,
  queryClient?: QueryClient
): Promise<ReadReceiptStatusData> {
  return new Promise((resolve, reject) => {
    const existing = pendingBatch.get(messageId);
    if (existing) {
      existing.push({ resolve, reject });
    } else {
      pendingBatch.set(messageId, [{ resolve, reject }]);
    }

    if (!batchScheduled) {
      batchScheduled = true;
      queueMicrotask(() => {
        flushReadReceiptStatusBatch(queryClient);
      });
    }
  });
}

export function useReadReceiptStatusQuery(
  messageId: Accessor<string | undefined | null>,
  enabled: Accessor<boolean>
) {
  const queryClient = useQueryClient();

  return useQuery(() => {
    const id = messageId();
    return {
      queryKey: ['email', 'read-receipt', id],
      enabled: enabled() && Boolean(id),
      queryFn: async (): Promise<ReadReceiptStatusData> => {
        if (!id) {
          return {
            message_id: '',
            first_opened_at: null,
            last_opened_at: null,
            open_count: 0,
          };
        }
        return fetchReadReceiptStatusBatched(id, queryClient);
      },
      staleTime: 10_000,
      refetchInterval: (query) => {
        if (typeof document !== 'undefined' && document.hidden) {
          return false;
        }
        const data = query.state.data;
        if (data && data.open_count > 0) {
          // Once opened, refresh less frequently (2 minutes) for open count updates
          return 120_000;
        }
        // Unopened sent messages refresh every 30s to catch the first open in a timely manner
        return 30_000;
      },
      refetchIntervalInBackground: false,
    };
  });
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
  const queryClient = useQueryClient();
  return useMutation(() => ({
    mutationFn: async (enabled: boolean) =>
      throwOnErr(() => readReceiptsClient.setPreference(enabled, linkId())),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['email', 'read-receipts-preference', linkId()],
      });
    },
  }));
}

export function useGlobalExtensionSettingsQuery(
  linkId: Accessor<string | undefined>
) {
  return useQuery(() => ({
    queryKey: ['email', 'extension-settings', linkId()],
    queryFn: async (): Promise<GlobalExtensionSettingsResponse> =>
      throwOnErr(() => readReceiptsClient.getGlobalSettings(linkId())),
    staleTime: 30_000,
  }));
}

export function useSetGlobalOpenTrackingMutation(
  linkId: Accessor<string | undefined>
) {
  const queryClient = useQueryClient();
  return useMutation(() => ({
    mutationFn: async (enabled: boolean) =>
      throwOnErr(() =>
        readReceiptsClient.setGlobalOpenTracking(enabled, linkId())
      ),
    onMutate: async (enabled) => {
      const queryKey = ['email', 'extension-settings', linkId()];
      await queryClient.cancelQueries({ queryKey });
      const previous =
        queryClient.getQueryData<GlobalExtensionSettingsResponse>(queryKey);
      queryClient.setQueryData<GlobalExtensionSettingsResponse>(queryKey, {
        email_open_tracking_enabled: enabled,
        email_tracking_pixel_blocking_enabled:
          previous?.email_tracking_pixel_blocking_enabled ?? false,
      });
      return { previous };
    },
    onSuccess: (settings) => {
      queryClient.setQueryData<GlobalExtensionSettingsResponse>(
        ['email', 'extension-settings', linkId()],
        settings
      );
      void queryClient.invalidateQueries({
        queryKey: ['email', 'extension-settings', linkId()],
      });
    },
    onError: (_error, _enabled, context) => {
      queryClient.setQueryData(
        ['email', 'extension-settings', linkId()],
        context?.previous
      );
    },
  }));
}

export function useSetGlobalPixelBlockingMutation(
  linkId: Accessor<string | undefined>
) {
  const queryClient = useQueryClient();
  return useMutation(() => ({
    mutationFn: async (enabled: boolean) =>
      throwOnErr(() =>
        readReceiptsClient.setGlobalPixelBlocking(enabled, linkId())
      ),
    onMutate: async (enabled) => {
      const queryKey = ['email', 'extension-settings', linkId()];
      await queryClient.cancelQueries({ queryKey });
      const previous =
        queryClient.getQueryData<GlobalExtensionSettingsResponse>(queryKey);
      queryClient.setQueryData<GlobalExtensionSettingsResponse>(queryKey, {
        email_open_tracking_enabled:
          previous?.email_open_tracking_enabled ?? true,
        email_tracking_pixel_blocking_enabled: enabled,
      });
      return { previous };
    },
    onSuccess: (settings) => {
      queryClient.setQueryData<GlobalExtensionSettingsResponse>(
        ['email', 'extension-settings', linkId()],
        settings
      );
      void queryClient.invalidateQueries({
        queryKey: ['email', 'extension-settings', linkId()],
      });
    },
    onError: (_error, _enabled, context) => {
      queryClient.setQueryData(
        ['email', 'extension-settings', linkId()],
        context?.previous
      );
    },
  }));
}
