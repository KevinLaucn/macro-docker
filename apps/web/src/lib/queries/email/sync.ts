import { toast } from '@core/component/Toast/Toast';
import { ENABLE_INBOX_SYNC_STATUS } from '@core/constant/featureFlags';
import { invalidateAllSoup } from '@queries/soup/normalized-cache';
import {
  BackfillStatus,
  type RefreshEmailEvent,
  RefreshEmailEventOneOfOneoneEvent,
  RefreshEmailEventOneOfOnethreeEvent,
} from '@service-email/generated/schemas';
import { leadingAndTrailing, throttle } from '@solid-primitives/scheduled';
import {
  clearBackfillProgress,
  invalidateBackfillJobs,
  setBackfillProgress,
} from './backfill';
import { invalidateEmailLinks } from './link';

const BACKFILL_SOUP_REFRESH_INTERVAL = 5_000;
const STEADY_STATE_SOUP_REFRESH_INTERVAL = 3_000;

const throttledBackfillSoupRefresh = leadingAndTrailing(
  throttle,
  invalidateAllSoup,
  BACKFILL_SOUP_REFRESH_INTERVAL
);

/**
 * Throttled soup invalidation for steady-state email mutations. The
 * notification-driven path (`browser_new_email_notification`) handles
 * *inbound* messages with a targeted single-entity refetch, but outbound
 * messages (replies/sends) never fire that notification. This throttled
 * list-level invalidation closes the gap, ensuring view-membership changes
 * (e.g. a reply promoting a thread into Important via `follow_up_required`)
 * land without a manual page refresh.
 */
const throttledSteadyStateSoupRefresh = leadingAndTrailing(
  throttle,
  invalidateAllSoup,
  STEADY_STATE_SOUP_REFRESH_INTERVAL
);

// The gateway double-encodes the payload, so callers must JSON-parse `data.data`
// (via `withParsedWebsocketPayload`) before passing it here.
function asRefreshEmailEvent(payload: unknown): RefreshEmailEvent | undefined {
  return typeof payload === 'object' &&
    payload !== null &&
    typeof (payload as { event?: unknown }).event === 'string'
    ? (payload as RefreshEmailEvent)
    : undefined;
}

/**
 * Handles `refresh_email` websocket events.
 *
 * Steady-state mutations (`upsert_message`, `update_labels`, `delete_message`)
 * receive a throttled list-level soup invalidation. The notification-driven
 * path already handles *inbound* messages with a targeted single-entity
 * refetch, but *outbound* messages (replies/sends) never fire that
 * notification, so this throttled invalidation is their only refresh signal
 * for view-membership changes (e.g. a reply promoting a thread into
 * Important).
 *
 * Backfill produces no notifications, so these are its only refresh signals.
 * `backfill_progress` carries live progress: it refetches soup (throttled,
 * because the backend emits one event per batch of threads) and on `complete`
 * refetches the links list so the inbox's `sync_status` settles out of
 * `SYNCING`, with a toast. The legacy `backfill` event now only signals
 * failure. `photo_synced` refetches the links list so the inbox's derived
 * `photo_url` lands once its self-contact photo finishes uploading.
 */
export function handleRefreshEmail(payload: unknown): void {
  const event = asRefreshEmailEvent(payload);
  if (!event) return;

  // An inbox finished its async teardown — drop its now-deleted threads and
  // settle its links row. This is the only reliable signal that teardown is
  // done; refetching on the delete request itself races the cascade delete.
  if (event.event === 'link_removed') {
    clearBackfillProgress(event.link_id);
    invalidateAllSoup();
    invalidateEmailLinks();
    invalidateBackfillJobs();
    return;
  }

  // The inbox's own photo finished uploading; refetch links to pick up the
  // newly-derived `photo_url`.
  if (event.event === RefreshEmailEventOneOfOneoneEvent.photo_synced) {
    invalidateEmailLinks();
    return;
  }

  // Backfill failed — settle the links row out of `SYNCING` and surface it.
  // Progress and completion now arrive as `backfill_progress` instead.
  if (event.event === 'backfill') {
    if (event.status === BackfillStatus.failed) {
      clearBackfillProgress(event.link_id);
      invalidateEmailLinks();
      invalidateBackfillJobs();
      if (ENABLE_INBOX_SYNC_STATUS) {
        toast.failure('Inbox sync failed');
      }
    }
    return;
  }

  // Live backfill progress. Record `completed_threads`/`total_threads` for the
  // progress UI and keep soup fresh (throttled, one event per batch). On
  // completion, drop the progress entry and settle the links row out of
  // `SYNCING` with a toast.
  if (event.event === RefreshEmailEventOneOfOnethreeEvent.backfill_progress) {
    throttledBackfillSoupRefresh();

    if (event.status === BackfillStatus.complete) {
      clearBackfillProgress(event.link_id);
      invalidateEmailLinks();
      invalidateBackfillJobs();
      if (ENABLE_INBOX_SYNC_STATUS) {
        toast.success('Inbox synced');
      }
    } else {
      setBackfillProgress(
        event.link_id,
        event.completed_threads,
        event.total_threads
      );
    }
    return;
  }

  // Steady-state mutations: the notification-driven path handles inbound
  // messages with a single-entity refetch, but outbound messages (replies/
  // sends) never fire `browser_new_email_notification`. Without this,
  // view-membership changes (e.g. a reply setting `follow_up_required` and
  // promoting a thread into Important) require a manual page refresh.
  // Throttled to avoid excessive refetches when multiple events arrive in
  // quick succession (e.g. a batch of label syncs).
  if (
    event.event === 'upsert_message' ||
    event.event === 'update_labels' ||
    event.event === 'delete_message'
  ) {
    throttledSteadyStateSoupRefresh();
  }
}
