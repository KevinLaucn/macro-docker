import { queryClient } from '@queries/client';
import { mountEmailMutation } from '@queries/email/tests/mutation';
import { useSendMessageMutation } from '@queries/email/thread';
import { QueryClientProvider } from '@tanstack/solid-query';
import { err, ok } from 'neverthrow';
import { createSignal, type JSX } from 'solid-js';
import { render } from 'solid-js/web';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readReceiptsClient } from './client';
import { handleReadReceiptOpenedEvent } from './queries';
import {
  ReadReceiptStatus,
  ThreadReadReceiptStatus,
} from './ReadReceiptStatus';

const mocks = vi.hoisted(() => ({ send: vi.fn(), refetch: vi.fn() }));
vi.mock('@service-email/client', () => ({
  emailClient: { sendMessage: mocks.send },
}));
vi.mock('@app/lib/analytics/analytics-context', () => ({
  useAnalytics: () => ({ track: vi.fn() }),
}));
vi.mock('@app/lib/analytics/posthog', () => ({ useFeatureFlag: vi.fn() }));
vi.mock('@core/component/Toast/Toast', () => ({ toast: { failure: vi.fn() } }));
vi.mock('@queries/soup/cache', () => ({
  refetchSoupEntity: mocks.refetch,
  optimisticUpdateSoupEntity: vi.fn(),
}));
vi.mock('@queries/soup/normalized-cache', () => ({
  invalidateAllSoup: vi.fn(),
}));
vi.mock('@queries/undo', () => ({ useUndoableMutation: vi.fn() }));
vi.mock('@queries/email/graphql/thread', () => ({
  createGraphqlEmailThreadQuery: vi.fn(),
  fetchGraphqlEmailThread: vi.fn(),
  mapGraphqlThreadError: vi.fn(),
}));
vi.mock('@ui', () => ({
  cn: (...classes: (string | undefined)[]) => classes.filter(Boolean).join(' '),
  Tooltip: (props: { children: JSX.Element }) => props.children,
}));

const messageKey = ['email', 'read-receipt', 'reply'];
const threadKey = ['email', 'read-receipt-thread', 'thread'];
const response = {
  message: {
    db_id: 'reply',
    thread_db_id: 'thread',
    link_id: 'inbox',
    draft_generation: 1,
    subject: 'Reply',
    send_time: '2026-11-04T00:00:00Z',
  },
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.refetch.mockResolvedValue(undefined);
  vi.spyOn(readReceiptsClient, 'getStatuses').mockResolvedValue(
    ok({ statuses: [] })
  );
});
afterEach(() => {
  queryClient.clear();
  vi.restoreAllMocks();
});

describe('queue acceptance → authoritative delivery → receipt', () => {
  it('keeps queued, cancelled and failed messages unchecked after HTTP success', async () => {
    const host = document.createElement('div');
    const [message, setMessage] = createSignal({
      db_id: 'reply',
      is_draft: true,
      is_sent: false,
    });
    const dispose = render(
      () => (
        <QueryClientProvider client={queryClient}>
          <ReadReceiptStatus message={message()} showIconOnly />
        </QueryClientProvider>
      ),
      host
    );
    try {
      const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
      mocks.send.mockResolvedValue(ok(response));
      const mutation = mountEmailMutation(useSendMessageMutation);
      await mutation.mutateAsync({ message: { subject: 'Reply' } });
      expect(host.querySelector('svg')).toBeNull();
      expect(queryClient.getQueryData(messageKey)).toBeUndefined();
      expect(queryClient.getQueryData(threadKey)).toBeUndefined();
      expect(invalidate).toHaveBeenCalledWith({ queryKey: messageKey });
      expect(invalidate).toHaveBeenCalledWith({ queryKey: threadKey });
      // Cancellation or provider failure never supplies a confirmed sent state.
      setMessage({ db_id: 'reply', is_draft: true, is_sent: false });
      await Promise.resolve();
      expect(host.querySelector('svg')).toBeNull();
      // A real delivery refresh makes the check visible without reloading.
      setMessage({ db_id: 'reply', is_draft: false, is_sent: true });
      await vi.waitFor(() => expect(host.querySelector('svg')).not.toBeNull());
      expect(host.querySelector('span')?.className).not.toContain(
        'text-orange'
      );
      await vi.waitFor(() => {
        expect(readReceiptsClient.getStatuses).toHaveBeenCalled();
        expect(queryClient.isFetching({ queryKey: messageKey })).toBe(0);
      });
      handleReadReceiptOpenedEvent(
        { messageId: 'reply', openCount: 1 },
        queryClient
      );
      await vi.waitFor(() =>
        expect(host.querySelector('span')?.className).toContain('text-orange')
      );
    } finally {
      dispose();
    }
  });

  it.each([
    { db_id: 'reply', from: { email: 'sender@example.com' } },
    { db_id: 'reply', is_sent: null, is_draft: false },
    { db_id: 'reply', is_sent: false, is_draft: false },
    { db_id: 'reply', is_sent: true, is_draft: true },
  ])(
    'ignores sender inference and stale local confirmations: %j',
    (message) => {
      queryClient.setQueryData(['email', 'read-receipt-sent', 'reply'], true);
      const host = document.createElement('div');
      const dispose = render(
        () => (
          <QueryClientProvider client={queryClient}>
            <ReadReceiptStatus message={message} showIconOnly />
          </QueryClientProvider>
        ),
        host
      );
      try {
        expect(host.querySelector('svg')).toBeNull();
      } finally {
        dispose();
      }
    }
  );

  it('updates thread checks only on authoritative latest-sent refresh, then matching opens', async () => {
    const old = {
      thread_id: 'thread',
      latest_sent_message_id: 'old',
      latest_message_id: 'old',
      is_last_message_sent: true,
      is_opened: true,
      open_count: 4,
      first_opened_at: null,
      last_opened_at: null,
    };
    const next = {
      ...old,
      latest_sent_message_id: 'reply',
      latest_message_id: 'reply',
      is_opened: false,
      open_count: 0,
    };
    let delivered = false;
    vi.spyOn(readReceiptsClient, 'getThreadStatuses').mockImplementation(
      async () => ok({ statuses: [delivered ? next : old] })
    );
    queryClient.setQueryData(threadKey, old);
    const host = document.createElement('div');
    const dispose = render(
      () => (
        <QueryClientProvider client={queryClient}>
          <ThreadReadReceiptStatus threadId="thread" showIconOnly />
        </QueryClientProvider>
      ),
      host
    );
    try {
      mocks.send.mockResolvedValue(ok(response));
      const mutation = mountEmailMutation(useSendMessageMutation);
      await mutation.mutateAsync({ message: { subject: 'Reply' } });
      await vi.waitFor(() =>
        expect(queryClient.isFetching({ queryKey: threadKey })).toBe(0)
      );
      expect(queryClient.getQueryData(threadKey)).toMatchObject({
        latest_sent_message_id: 'old',
      });
      delivered = true;
      await queryClient.invalidateQueries({ queryKey: threadKey });
      await vi.waitFor(() =>
        expect(host.querySelector('span')?.className).not.toContain(
          'text-orange'
        )
      );
      expect(host.querySelector('svg')).not.toBeNull();
      handleReadReceiptOpenedEvent(
        { messageId: 'old', openCount: 5 },
        queryClient
      );
      expect(host.querySelector('span')?.className).not.toContain(
        'text-orange'
      );
      handleReadReceiptOpenedEvent(
        { messageId: 'reply', openCount: 1 },
        queryClient
      );
      await vi.waitFor(() =>
        expect(host.querySelector('span')?.className).toContain('text-orange')
      );
    } finally {
      dispose();
    }
  });

  it('preserves earlier opens without attributing them to a queued reply', async () => {
    queryClient.setQueryData(threadKey, {
      latest_sent_message_id: 'old',
      is_opened: true,
      open_count: 4,
    });
    handleReadReceiptOpenedEvent(
      { messageId: 'reply', openCount: 2 },
      queryClient
    );
    mocks.send.mockResolvedValue(ok(response));
    const mutation = mountEmailMutation(useSendMessageMutation);
    await mutation.mutateAsync({
      message: { subject: 'Reply' },
      skipSoupRefetch: true,
    });
    expect(queryClient.getQueryData(messageKey)).toMatchObject({
      open_count: 2,
    });
    expect(queryClient.getQueryData(threadKey)).toMatchObject({
      latest_sent_message_id: 'old',
    });
    expect(mocks.refetch).not.toHaveBeenCalled();
  });

  it('never publishes a sent receipt when enqueueing fails', async () => {
    mocks.send.mockResolvedValue(
      err([{ code: 'SERVER_ERROR', message: 'Offline' }])
    );
    const mutation = mountEmailMutation(useSendMessageMutation);
    await expect(
      mutation.mutateAsync({ message: { subject: 'Reply' } })
    ).rejects.toThrow();
    expect(queryClient.getQueryData(messageKey)).toBeUndefined();
    expect(queryClient.getQueryData(threadKey)).toBeUndefined();
  });
});
