# MAIL_REALTIME_SYNC_PROTECTION

Owner: `EMAIL-REALTIME-001`. Keep upstream Skills byte-identical.

## Root cause

The GraphQL migration removed the legacy connection-gateway notification
consumer. Fetch-only browser sessions also skipped `SoupUpdates`, while open
thread readers registered only for archive mutations. Invalidating the former
TanStack thread key therefore could not refresh an open GraphQL conversation.
The historical parser test survived but the CI web group never ran it.

## Compatibility boundary

- Keep the official Gmail history/import, database IDs, Soup events and GraphQL
  websocket transport. Do not restore the retired browser event producer.
- `packages/fork/email-realtime/readers.ts` registers mounted remote thread
  queries, coalesces concurrent events and releases disabled/unmounted readers.
- `email/graphql/thread.ts` supplies the canonical ID and paginated refetch.
- `graphql-soup-websocket.ts` retains Soup subscriptions without a cache host;
  email patches refresh matching fetch-only details and unmaintained lists.
  Subsequent connections recover missed changes. Cached sessions retain their
  official normalized-cache update path.
- Mail unread navigation and saved-view indicators use active Soup queries;
  refresh those probes together with lists, rather than inventing a count API.

## Upstream sync and repair

Run `just test-mail-realtime` whenever the existing overlap gate reports this
customization. The existing web CI group and fork gate run it automatically.
The watch surface includes import/domain/effects, Soup transport/cache, detail
queries, lists, navigation and self-host routing. Hook validation rejects missing
integration seams. A failed gate must block publication, never bless a stale marker.

During sync, adapt the fork reader module first, then only the exact registered
integration hooks if upstream changed signatures or lifecycle. Re-run data-path
tests and the overlap simulation before release. Automatic synchronization may
perform this repair only when tests prove compatibility; never blindly rewrite
upstream logic or declare successful repair on marker presence alone.

Regression coverage: consecutive replies, matching identity, pagination, unique
message membership, disabled/unmounted readers, failed requests, burst
coalescing, websocket delivery and reconnect recovery. Extend the real urql +
HTTP test fixture, rather than testing component visibility alone.

Retire the adapter when upstream supplies equivalent fetch-only email event and
reconnect handling and these same tests pass with the hooks removed.
