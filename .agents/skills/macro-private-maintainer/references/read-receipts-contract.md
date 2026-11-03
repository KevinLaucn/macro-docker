# Read receipts: mandatory merge contract

Owner: `READ-RECEIPTS-001`. Load this reference when changing tracking, send/reply,
email rendering, thread queries/mappers, GraphQL cache, or websocket dispatch.
During upstream sync, load it whenever its registered dependency paths overlap.

Verify the entire runtime chain:

`HTTP queue acceptance → handleReadReceiptQueuedMessage → invalidate receipt caches
→ authoritative delivered message refresh (is_sent=true, is_draft=false)
→ ReadReceiptStatus / ThreadReadReceiptStatus → recipient pixel request
→ email_read_receipt_opened → matching message + thread caches → double check`.

The send-completion PRIVATE-HOOK runs inside the real mutation's successful
completion, before optional analytics or Soup refresh, and only invalidates receipt
queries. The send API acknowledges an undo-window queue entry, not provider delivery.
Queued, cancelled, failed and scheduled drafts must never create a local sent
confirmation or override authoritative delivery flags. An opened previous reply must not make the
new reply appear opened. An open event received before the send response must
survive completion. Never rely on a full-page refresh or only test a helper.
Show a message check only when its refreshed state explicitly says `is_sent=true`
and is not a draft; neither an HTTP success, pixel event nor inferred sender
identity proves delivery. Preserve upstream delivery refresh and receipt polling.
For the legacy `/t/o/` pixel, respect the upstream recipient-ownership decision:
strip before rendering whenever `showReadReceiptPixel` is false or unknown,
including self-CC, aliases and copies in another owned inbox with `is_sent=false`.
An authorized recipient copy must retain its pixel. Strip legacy pixels from all
quoted reply/forward bodies, regardless of their `is_sent` flag.

`paths` must watch callers, REST/GraphQL schemas and mappers, thread refresh,
GraphQL cache, connection transport, gateway and deployment configuration.
`owned_paths` grants exact integration files only. Preserve upstream draft/thread
refresh behavior; if it changes, adapt and test the seam rather than adding an
unregistered workaround in core.

Run `just fork-gate` and `bun run --cwd packages/fork/read-receipts test`.
The unified local gate executes this contract suite itself; printing required
test group names is not sufficient enforcement.
The `fork-read-receipts` project must include the real upstream send mutation
regression and email body renderer integration tests. Hook presence alone is
insufficient. Test queued responses without false checks, cancelled/failed
undelivered states, delivery refresh without remount, early-open preservation,
sender/unknown pixel blocking and allowed recipient pixels. Removing the
send-completion call must fail the receipt-query invalidation assertion.

Browser acceptance on an authorized test mailbox: reply queues without a sent
check → provider delivery and refresh show the check without reload;
recipient opens → double check and Sent envelope update; send another
reply → its status starts unopened. Viewing Sent, rendering historical bodies,
and reply/forward preparation must never request our own tracking pixels.
Do not send test email to a real recipient without explicit authorization.
Report browser verification as blocked when no authorized mailbox is available.
