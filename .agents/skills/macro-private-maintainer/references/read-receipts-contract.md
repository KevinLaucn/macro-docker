# Read receipts: mandatory merge contract

Owner: `READ-RECEIPTS-001`. Load this reference when changing tracking, send/reply,
email rendering, thread queries/mappers, GraphQL cache, or websocket dispatch.
During upstream sync, load it whenever its registered dependency paths overlap.

Verify the entire runtime chain:

`send success → handleReadReceiptSentMessage → message + latest-sent-thread caches
→ ReadReceiptStatus / ThreadReadReceiptStatus → recipient pixel request
→ email_read_receipt_opened → matching message + thread caches → double check`.

The send-completion PRIVATE-HOOK must be inside the real mutation's successful
completion, before optional analytics or Soup refresh. Failed sends and scheduled
drafts must not publish a sent receipt. An opened previous reply must not make the
new reply appear opened. An open event received before the send response must
survive completion. Never rely on a full-page refresh or only test a helper.
The local successful-send confirmation must allow a checkmark while cached
thread fields still say `is_sent=false` / `is_draft=true`; an unsent draft must
remain hidden. Confirmations must come only from a successful delivery response,
never from a pixel open event or inferred sender identity.

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
insufficient. Demonstrate that removing the send-completion call makes its
regression fail.

Browser acceptance on an authorized test mailbox: reply → check appears without
reload; recipient opens → double check and Sent envelope update; send another
reply → its status starts unopened. Viewing Sent, rendering historical bodies,
and reply/forward preparation must never request our own tracking pixels.
Do not send test email to a real recipient without explicit authorization.
Report browser verification as blocked when no authorized mailbox is available.
