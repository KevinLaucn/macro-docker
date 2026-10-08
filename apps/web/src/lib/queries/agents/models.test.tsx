/**
 * @vitest-environment jsdom
 */

import { getAppCapabilities } from '@core/constant/featureFlags';
import { agentHarnessServiceClient } from '@service-agent-harness/client';
import { QueryClient, QueryClientProvider } from '@tanstack/solid-query';
import { ok } from 'neverthrow';
import type { JSX } from 'solid-js';
import { render } from 'solid-js/web';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildAgentModelTargets,
  useAgentModelsQueries,
  useAgentModelsQuery,
} from './models';

vi.mock('@core/constant/featureFlags', () => ({
  getAppCapabilities: vi.fn(() => ({ agents: true })),
}));

vi.mock('@service-agent-harness/client', () => ({
  agentHarnessServiceClient: {
    loadAgentModels: vi.fn(),
  },
}));

let queryClient: QueryClient;
let dispose: (() => void) | undefined;

function renderHook(factory: () => unknown) {
  dispose = render(
    () => (
      <QueryClientProvider client={queryClient}>
        {(() => {
          factory();
          return null as unknown as JSX.Element;
        })()}
      </QueryClientProvider>
    ),
    document.body
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getAppCapabilities).mockReturnValue({
    ...getAppCapabilities(),
    agents: true,
  });
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
});

afterEach(() => {
  dispose?.();
  dispose = undefined;
  queryClient.clear();
});

describe('agent model discovery', () => {
  it('does not load models when Agents is unavailable, even if the caller enables it', async () => {
    vi.mocked(getAppCapabilities).mockReturnValue({
      ...getAppCapabilities(),
      agents: false,
    });
    renderHook(() =>
      useAgentModelsQuery(
        () => ({ harness: 'in-memory' }),
        () => true
      )
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(agentHarnessServiceClient.loadAgentModels).not.toHaveBeenCalled();
  });
  it('constructs every available target in parallel without waiting for another target', async () => {
    const targets = buildAgentModelTargets(
      true,
      [{ id: 'harness-a' }, { id: 'harness-b' }],
      true
    );
    const pending = new Promise<never>(() => {});
    vi.mocked(agentHarnessServiceClient.loadAgentModels).mockReturnValue(
      pending
    );

    renderHook(() => useAgentModelsQueries(() => targets));

    await vi.waitFor(() => {
      expect(agentHarnessServiceClient.loadAgentModels).toHaveBeenCalledTimes(
        5
      );
    });
    expect(
      vi
        .mocked(agentHarnessServiceClient.loadAgentModels)
        .mock.calls.map(([request]) => request)
    ).toEqual([
      { harness: 'in-memory' },
      { harness: 'claude-cloud' },
      { harness: 'cursor' },
      { harness: 'macrod', harnessId: 'harness-a' },
      { harness: 'macrod', harnessId: 'harness-b' },
    ]);
  });

  it('omits Cursor when it is not registered', () => {
    expect(buildAgentModelTargets(false, [{ id: 'harness-a' }], true)).toEqual([
      { harness: 'in-memory' },
      { harness: 'claude-cloud' },
      { harness: 'macrod', harnessId: 'harness-a' },
    ]);
  });

  it('keeps a loaded catalog across remounts', async () => {
    vi.mocked(agentHarnessServiceClient.loadAgentModels).mockResolvedValue(
      ok({
        status: 'available',
        models: [],
      })
    );

    renderHook(() =>
      useAgentModelsQueries(() => [
        { harness: 'in-memory' },
        { harness: 'cursor' },
      ])
    );
    await vi.waitFor(() => {
      expect(agentHarnessServiceClient.loadAgentModels).toHaveBeenCalledTimes(
        2
      );
      expect(
        queryClient
          .getQueryCache()
          .getAll()
          .every((query) => query.state.status === 'success')
      ).toBe(true);
    });

    dispose?.();
    renderHook(() =>
      useAgentModelsQueries(() => [
        { harness: 'in-memory' },
        { harness: 'cursor' },
      ])
    );
    await vi.waitFor(() => {
      expect(
        queryClient
          .getQueryCache()
          .getAll()
          .every((query) => query.state.status === 'success')
      ).toBe(true);
    });
    expect(agentHarnessServiceClient.loadAgentModels).toHaveBeenCalledTimes(2);
  });

  it('does not query Claude when its feature flag is off', async () => {
    vi.mocked(agentHarnessServiceClient.loadAgentModels).mockReturnValue(
      new Promise<never>(() => {})
    );
    renderHook(() =>
      useAgentModelsQueries(() => buildAgentModelTargets(true, [], false))
    );
    await vi.waitFor(() =>
      expect(agentHarnessServiceClient.loadAgentModels).toHaveBeenCalledTimes(2)
    );
    expect(
      vi
        .mocked(agentHarnessServiceClient.loadAgentModels)
        .mock.calls.map(([request]) => request)
    ).toEqual([{ harness: 'in-memory' }, { harness: 'cursor' }]);
  });
});
