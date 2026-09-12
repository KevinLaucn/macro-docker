import { throwOnErr } from '@core/util/result';
import { useMutation, useQuery } from '@tanstack/solid-query';
import type { Accessor } from 'solid-js';
import { readReceiptsClient } from './client';

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
