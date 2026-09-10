import { throwOnErr } from '@core/util/result';
import { authServiceClient } from '@service-auth/client';
import { useQuery } from '@tanstack/solid-query';
import type { SelfHostHealthReport } from './types';

export const selfHostHealthKeys = {
  all: ['self-host-health'] as const,
};

export function useSelfHostHealthQuery(options?: {
  enabled?: boolean | (() => boolean);
  refetchInterval?: number | false;
}) {
  return useQuery(() => {
    const isEnabled =
      typeof options?.enabled === 'function'
        ? options.enabled()
        : (options?.enabled ?? true);

    return {
      queryKey: selfHostHealthKeys.all,
      queryFn: async (): Promise<SelfHostHealthReport> => {
        return await throwOnErr(async () => {
          return await authServiceClient.getSelfHostHealthCheck();
        });
      },
      staleTime: 60_000,
      refetchInterval: options?.refetchInterval ?? 120_000,
      enabled: isEnabled,
      retry: false,
    };
  });
}
