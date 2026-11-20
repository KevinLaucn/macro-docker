import { describe, expect, it, vi } from 'vitest';
import {
  refreshEmailRealtimeReaders,
  registerEmailRealtimeReader,
} from '../readers';

describe('mounted realtime readers', () => {
  it('keeps a queued reply when the in-flight request fails', async () => {
    let fail = (_error: Error) => {};
    const first = new Promise<void>((_resolve, reject) => {
      fail = reject;
    });
    const refresh = vi
      .fn()
      .mockImplementationOnce(() => first)
      .mockResolvedValue(undefined);
    const stop = registerEmailRealtimeReader({
      threadId: () => 'thread-1',
      isEnabled: () => true,
      refresh,
    });
    try {
      const initial = refreshEmailRealtimeReaders(['thread-1']);
      await Promise.resolve();
      const pending = refreshEmailRealtimeReaders(['thread-1']);
      fail(new Error('transient failure'));
      await Promise.all([initial, pending]);
      expect(refresh).toHaveBeenCalledTimes(2);
    } finally {
      stop();
    }
  });
  it('serializes bursts and runs a catch-up after the in-flight snapshot', async () => {
    let release = () => {};
    const first = new Promise<void>((resolve) => {
      release = resolve;
    });
    const refresh = vi
      .fn()
      .mockImplementationOnce(() => first)
      .mockResolvedValue(undefined);
    const stop = registerEmailRealtimeReader({
      threadId: () => 'thread-1',
      isEnabled: () => true,
      refresh,
    });
    try {
      const initial = refreshEmailRealtimeReaders(['thread-1']);
      await Promise.resolve();
      const pending = Array.from({ length: 20 }, () =>
        refreshEmailRealtimeReaders(['thread-1'])
      );
      expect(refresh).toHaveBeenCalledTimes(1);
      release();
      await Promise.all([initial, ...pending]);
      expect(refresh).toHaveBeenCalledTimes(2);
    } finally {
      stop();
    }
  });

  it('drops queued catch-up after unmount and allows recovery after failure', async () => {
    const refresh = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(undefined);
    const stop = registerEmailRealtimeReader({
      threadId: () => 'thread-1',
      isEnabled: () => true,
      refresh,
    });
    try {
      await expect(refreshEmailRealtimeReaders()).rejects.toThrow('offline');
      await refreshEmailRealtimeReaders();
      expect(refresh).toHaveBeenCalledTimes(2);
      stop();
      await refreshEmailRealtimeReaders();
      expect(refresh).toHaveBeenCalledTimes(2);
    } finally {
      stop();
    }
  });
});
