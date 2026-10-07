import { queryClient } from '@queries/client';
import { mountEmailMutation } from '@queries/email/tests/mutation';
import { useSendMessageMutation } from '@queries/email/thread';
import { QueryClientProvider } from '@tanstack/solid-query';
import { err, ok } from 'neverthrow';
import type { JSX } from 'solid-js';
import { render } from 'solid-js/web';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  ReadReceiptStatusData,
  ThreadReadReceiptStatusData,
} from './client';
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
vi.mock('@core/context/user', () => ({
  useEmail: () => () => 'sender@example.com',
}));
vi.mock('@queries/email/link', () => ({
  useEmailLinksQuery: () => ({ isSuccess: false }),
}));
vi.mock('@ui', () => ({
  cn: (...classes: (string | undefined)[]) => classes.filter(Boolean).join(' '),
  Tooltip: (props: { children: JSX.Element }) => props.children,
}));

const messageKey = ['email', 'read-receipt', 'reply'];
const threadKey = ['email', 'read-receipt-thread', 'thread'];
const response = {
  message: { db_id: 'reply', thread_db_id: 'thread', link_id: 'inbox' },
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.refetch.mockResolvedValue(undefined);
});
afterEach(() => queryClient.clear());

describe('upstream send mutation → fork receipt cache', () => {
  it('shows a sent-message check even while thread metadata still describes its draft', async () => {
    const host = document.createElement('div');
    const dispose = render(
      () => (
        <QueryClientProvider client={queryClient}>
          <ReadReceiptStatus
            message={{ db_id: 'reply', is_draft: true, is_sent: false }}
            showIconOnly
          />
        </QueryClientProvider>
      ),
      host
    );
    try {
      expect(host.querySelector('svg')).toBeNull();
      mocks.send.mockResolvedValue(ok(response));
      const mutation = mountEmailMutation(useSendMessageMutation);
      await mutation.mutateAsync({ message: { subject: 'Reply' } });
      await vi.waitFor(() => expect(host.querySelector('svg')).not.toBeNull());
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
  it('renders a check after reply completion and a double check after opening, without remount or reload', async () => {
    queryClient.setQueryData(threadKey, {
      thread_id: 'thread',
      latest_sent_message_id: '',
      is_opened: false,
      open_count: 0,
    });
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
      expect(host.querySelector('svg')).toBeNull();
      mocks.send.mockResolvedValue(ok(response));
      const mutation = mountEmailMutation(useSendMessageMutation);
      await mutation.mutateAsync({ message: { subject: 'Reply' } });
      await vi.waitFor(() => expect(host.querySelector('svg')).not.toBeNull());
      const singleCheck = host.querySelector('svg')?.innerHTML;
      handleReadReceiptOpenedEvent(
        { messageId: 'reply', openCount: 1 },
        queryClient
      );
      await vi.waitFor(() => {
        expect(host.querySelector('span')?.className).toContain('text-orange');
        expect(host.querySelector('svg')?.innerHTML).not.toBe(singleCheck);
      });
    } finally {
      dispose();
    }
  });
  it('publishes the reply receipt immediately and replaces the previous opened message', async () => {
    queryClient.setQueryData(threadKey, {
      thread_id: 'thread',
      latest_sent_message_id: 'old',
      is_opened: true,
      open_count: 4,
    });
    mocks.send.mockResolvedValue(ok(response));
    const mutation = mountEmailMutation(useSendMessageMutation);
    await mutation.mutateAsync({
      message: { subject: 'Reply', thread_db_id: 'thread' },
    });

    expect(
      queryClient.getQueryData<ReadReceiptStatusData>(messageKey)?.open_count
    ).toBe(0);
    expect(
      queryClient.getQueryData<ThreadReadReceiptStatusData>(threadKey)
    ).toMatchObject({
      latest_sent_message_id: 'reply',
      is_opened: false,
      open_count: 0,
    });
    handleReadReceiptOpenedEvent(
      { messageId: 'old', openCount: 5 },
      queryClient
    );
    expect(
      queryClient.getQueryData<ThreadReadReceiptStatusData>(threadKey)
        ?.is_opened
    ).toBe(false);
    handleReadReceiptOpenedEvent(
      { messageId: 'reply', openCount: 1 },
      queryClient
    );
    expect(
      queryClient.getQueryData<ThreadReadReceiptStatusData>(threadKey)
        ?.is_opened
    ).toBe(true);
  });

  it('preserves an open event arriving before the successful send response', async () => {
    mocks.send.mockImplementation(async () => {
      handleReadReceiptOpenedEvent(
        { messageId: 'reply', openCount: 2 },
        queryClient
      );
      return ok(response);
    });
    const mutation = mountEmailMutation(useSendMessageMutation);
    await mutation.mutateAsync({
      message: { subject: 'Reply' },
      skipSoupRefetch: true,
    });
    expect(
      queryClient.getQueryData<ReadReceiptStatusData>(messageKey)?.open_count
    ).toBe(2);
    expect(
      queryClient.getQueryData<ThreadReadReceiptStatusData>(threadKey)
        ?.is_opened
    ).toBe(true);
    expect(mocks.refetch).not.toHaveBeenCalled();
  });

  it('never publishes a sent receipt when sending fails', async () => {
    mocks.send.mockResolvedValue(
      err([{ code: 'SERVER_ERROR', message: 'Offline' }])
    );
    const mutation = mountEmailMutation(useSendMessageMutation);
    await expect(
      mutation.mutateAsync({ message: { subject: 'Reply' } })
    ).rejects.toThrow();
    expect(queryClient.getQueryData(messageKey)).toBeUndefined();
    expect(queryClient.getQueryData(threadKey)).toBeUndefined();
    expect(
      queryClient.getQueryData(['email', 'read-receipt-sent', 'reply'])
    ).toBeUndefined();
  });
});
