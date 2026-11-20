type Reader = {
  threadId: () => string;
  isEnabled: () => boolean;
  refresh: () => Promise<void>;
};

const readers = new Set<Reader>();
const running = new Map<Reader, { pending: boolean; promise: Promise<void> }>();

/** Mount-scoped readers keep routing and account ownership in the query facade. */
export function registerEmailRealtimeReader(reader: Reader): () => void {
  readers.add(reader);
  return () => {
    readers.delete(reader);
  };
}

function refreshReader(reader: Reader): Promise<void> {
  const current = running.get(reader);
  if (current) {
    current.pending = true;
    return current.promise;
  }
  const state = { pending: false, promise: Promise.resolve() };
  // Defer execution until the coalescing entry exists, including synchronous errors.
  state.promise = Promise.resolve().then(async () => {
    try {
      let failure: unknown;
      do {
        state.pending = false;
        if (!readers.has(reader) || !reader.isEnabled()) return;
        try {
          await reader.refresh();
          failure = undefined;
        } catch (error) {
          failure = error;
        }
      } while (state.pending);
      if (failure) throw failure;
    } finally {
      running.delete(reader);
    }
  });
  running.set(reader, state);
  return state.promise;
}

/** Missing IDs mean reconnect catch-up; ordinary patches touch matching readers only. */
export async function refreshEmailRealtimeReaders(
  threadIds?: readonly string[]
): Promise<void> {
  const ids = threadIds && new Set(threadIds);
  await Promise.all(
    [...readers]
      .filter(
        (reader) => reader.isEnabled() && (!ids || ids.has(reader.threadId()))
      )
      .map(refreshReader)
  );
}
