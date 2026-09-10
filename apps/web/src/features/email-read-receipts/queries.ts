import { throwOnErr } from '@core/util/result';
import { useMutation, useQuery, useQueryClient } from '@tanstack/solid-query';
import type { Accessor } from 'solid-js';
import {
  type GlobalExtensionSettingsResponse,
  type ReadReceiptStatusData,
  readReceiptsClient,
} from './client';

export function useReadReceiptStatusQuery(
  messageId: Accessor<string | undefined | null>,
  enabled: Accessor<boolean>
) {
  return useQuery(() => ({
    queryKey: ['email', 'read-receipt', messageId()],
    enabled: enabled() && Boolean(messageId()),
    queryFn: async (): Promise<ReadReceiptStatusData> => {
      const id = messageId();
      if (!id) {
        return {
          message_id: '',
          first_opened_at: null,
          last_opened_at: null,
          open_count: 0,
        };
      }
      const response = await throwOnErr(() =>
        readReceiptsClient.getStatuses([id])
      );
      return (
        response.statuses[0] ?? {
          message_id: id,
          first_opened_at: null,
          last_opened_at: null,
          open_count: 0,
        }
      );
    },
    staleTime: 10_000,
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
