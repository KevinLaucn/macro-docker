import { QueryClientProvider } from '@tanstack/solid-query';
import { createClient, fetchExchange } from '@urql/core';
import { createComponent, createRoot } from 'solid-js';
import { afterEach, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ client: undefined as unknown }));

// Only replace the transport boundary and UI projection; query construction,
// HTTP execution, active-reader registration and refresh coordination are real.
vi.mock('@service-storage/graphql-soup', () => ({
  getGraphqlSoupClient: () => state.client,
  getGraphqlSoupCacheHost: () => undefined,
  hasGraphqlCacheHost: () => false,
  graphqlSoupProjectionSupported: () => true,
  mapGraphqlSoupItem: (item: unknown) => item,
}));
vi.mock('@queries/client', async () => {
  const { QueryClient } = await import('@tanstack/solid-query');
  return {
    queryClient: new QueryClient({
      defaultOptions: { queries: { retry: false } },
    }),
  };
});
vi.mock('@queries/soup/transform-utils', () => ({
  isDisplayableSoupItem: () => true,
  mapApiSoupItemToEntity: (item: object) => ({ ...item, type: 'email' }),
  mapSoupPageToEntityList: (page: { items: object[] }) =>
    page.items.map((item) => ({ ...item, type: 'email' })),
}));
vi.mock('@app/features/next-soup/filters/query-filters', () => ({
  filterSoupItemByRequestBody: () => true,
}));
vi.mock('@service-storage/client', () => ({ storageServiceClient: {} }));

import { queryClient } from '@queries/client';
import { refreshActiveGraphqlSoupQueries } from '@queries/soup/graphql/active-queries';
import {
  type SoupAstItemsQuery,
  useSoupAstItemsQuery,
} from '@queries/soup/items';
import { response } from '../../../../apps/web/src/lib/queries/soup/graphql/browser-test/fixtures';

const cleanup: Array<() => void> = [];
afterEach(() => {
  for (const dispose of cleanup.splice(0)) dispose();
  queryClient.clear();
});

it('refreshes mounted mail lists and unread probes through HTTP after arrivals and reconnect catch-up', async () => {
  let serverIds: number[] = [];
  let unread = false;
  let requests = 0;
  state.client = createClient({
    url: 'https://example.test/graphql',
    exchanges: [fetchExchange],
    fetch: async (_input, init) => {
      requests += 1;
      const body = JSON.parse(String(init?.body));
      const input = body.variables.input.initial;
      const unreadOnly = JSON.stringify(input.filters).includes('"read":false');
      if (input.limit === 1) expect(unreadOnly).toBe(true);
      const data = response(unreadOnly && !unread ? [] : serverIds);
      data.user.soup.items = data.user.soup.items.map((item) => ({
        ...item,
        isRead: !unread,
      }));
      return new Response(JSON.stringify({ data }), {
        headers: { 'content-type': 'application/json' },
      });
    },
  });
  let list!: SoupAstItemsQuery;
  let probe!: SoupAstItemsQuery;
  createRoot((dispose) => {
    cleanup.push(dispose);
    createComponent(QueryClientProvider, {
      client: queryClient,
      get children() {
        list = useSoupAstItemsQuery(() => ({
          params: { limit: 20 },
          body: {},
          transport: 'graphql',
        }));
        probe = useSoupAstItemsQuery(() => ({
          params: { limit: 1 },
          body: { ef: { l: { Read: false } } },
          transport: 'graphql',
        }));
        return null;
      },
    });
  });
  await vi.waitFor(() => {
    expect(list.error).toBeNull();
    expect(probe.error).toBeNull();
    expect([list.data?.entities.length, probe.data?.entities.length]).toEqual([
      0, 0,
    ]);
  });
  serverIds = [2, 1];
  unread = true;
  await refreshActiveGraphqlSoupQueries({
    unmaintainedOnly: true,
    throwOnError: true,
  });
  expect(list.data?.entities.map((item) => item.id)).toHaveLength(2);
  expect(
    probe.data?.entities.some((item) => item.type === 'email' && !item.isRead)
  ).toBe(true);
  unread = false;
  await refreshActiveGraphqlSoupQueries({
    unmaintainedOnly: true,
    throwOnError: true,
  });
  expect(list.data?.entities).toHaveLength(2);
  expect(probe.data?.entities).toHaveLength(0);
  serverIds = [3, 2, 1];
  unread = true;
  await refreshActiveGraphqlSoupQueries({
    unmaintainedOnly: true,
    throwOnError: true,
  });
  expect(list.data?.entities).toHaveLength(3);
  expect(new Set(list.data?.entities.map((item) => item.id)).size).toBe(3);
  expect(
    probe.data?.entities.some((item) => item.type === 'email' && !item.isRead)
  ).toBe(true);
  expect(requests).toBe(8);
  for (const dispose of cleanup.splice(0)) dispose();
  await refreshActiveGraphqlSoupQueries({ unmaintainedOnly: true });
  expect(requests).toBe(8);
});
