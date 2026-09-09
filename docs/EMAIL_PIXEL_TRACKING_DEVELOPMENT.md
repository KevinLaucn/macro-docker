# Email Pixel Tracking Development Plan

## Goal

Normalize the current read-receipt pixel tracking implementation into private feature modules, then add two user-facing controls:

- Send-side pixel tracking: insert Macro's open-tracking pixel only when enabled.
- Receive-side pixel blocking: strip or suppress common tracking pixels in received mail only when enabled.

Both features must stay self-hosted, i18n-ready, and easy to preserve during upstream sync.

## Current Context

Existing read-receipt tracking already covers the core send-side flow:

1. `email_service` injects a 1x1 tracking pixel before sending mail.
2. `email_messages` stores `open_tracking_token`, `first_opened_at`, `last_opened_at`, and `open_count`.
3. Public route `/t/o/{token}` records opens and returns a transparent GIF.
4. Authenticated route `/email/messages/tracking` returns per-message open status.
5. Frontend shows read-receipt status for sent messages and strips Macro's own pixels while rendering sent mail.
6. Per-inbox setting `read_receipts_enabled` already exists.

The current issue is not feature absence. The issue is source layout: tracking logic is spread across existing upstream-owned files and should be normalized into private feature directories with thin hooks.

## Placement Rules

Do not move this feature into `packages/`. `packages/` is for shared TS/JS workspace packages, not Rust service logic, DB clients, or SQLx migrations.

Use the existing compile boundaries:

```text
services/email_service/src/features/read_receipts/
crates/email_db_client/src/read_receipts/
crates/email_utils/src/read_receipts/
apps/web/src/features/email-read-receipts/
crates/macro_db_client/migrations/
```

Migration files stay in `crates/macro_db_client/migrations/`.

## Target Backend Layout

```text
services/email_service/src/features/read_receipts/
├── mod.rs
├── send.rs
├── routes.rs
├── tracking.rs
├── status.rs
└── settings.rs
```

Responsibilities:

- `send.rs`: prepare outgoing HTML, strip previous Macro pixels, check global + inbox settings, persist token, inject pixel.
- `routes.rs`: expose public and authenticated routers.
- `tracking.rs`: public pixel endpoint `/t/o/{token}`.
- `status.rs`: authenticated read-receipt status endpoint.
- `settings.rs`: authenticated settings endpoints for send-side tracking and receive-side blocking.

Upstream-owned hooks should be reduced to small marked entries:

```rust
// PRIVATE-HOOK: read_receipts:send
read_receipts::prepare_outgoing_message(...);

// PRIVATE-HOOK: read_receipts:routes
.merge(read_receipts::public_router(...))
.merge(read_receipts::authenticated_router(...))
```

## Target DB Client Layout

```text
crates/email_db_client/src/read_receipts/
├── mod.rs
├── messages.rs
└── settings.rs
```

Responsibilities:

- `messages.rs`: set token, record open, fetch status, fetch recent events.
- `settings.rs`: get/update global send tracking, inbox send tracking, and receive-side blocker settings.

Existing `crates/email_db_client/src/settings.rs` should keep signature settings. Read-receipt settings should move out to avoid mixing unrelated concerns.

## Target Utility Layout

```text
crates/email_utils/src/read_receipts/
├── mod.rs
└── html.rs
```

Responsibilities:

- Build pixel URLs.
- Inject Macro send-side tracking pixel.
- Strip Macro's own tracking pixels from outgoing replies/forwards.
- Detect and strip common receive-side tracking pixels.

Initial receive-side blocker should stay conservative:

- Block images with explicit `width=1` and `height=1`.
- Block inline styles that force both dimensions to 1px.
- Block known Macro tracking path `/t/o/`.
- Do not block normal logos, signatures, product images, or CID attachments.

Do not infer third-party commercial tracker lists yet. Add that later only after false-positive review.

## Target Frontend Layout

```text
apps/web/src/features/email-read-receipts/
├── index.ts
├── client.ts
├── queries.ts
├── utils.ts
├── ReadReceiptsSection.tsx
├── PixelBlockingSection.tsx
├── ReadReceiptStatus.tsx
└── *.test.ts
```

Responsibilities:

- `client.ts`: email-service API calls.
- `queries.ts`: Solid Query hooks.
- `utils.ts`: status formatting and safe HTML stripping helpers.
- `ReadReceiptsSection.tsx`: Extensions page send-side global control.
- `PixelBlockingSection.tsx`: Extensions page receive-side global control.
- `ReadReceiptStatus.tsx`: compact status shown near sent messages.

Frontend hooks in upstream-owned files should be small:

```tsx
// PRIVATE-HOOK: read_receipts:settings
<ReadReceiptsSection />
<PixelBlockingSection />

// PRIVATE-HOOK: read_receipts:sent-status
<ReadReceiptStatus message={message} />

// PRIVATE-HOOK: read_receipts:block-received-pixels
stripBlockedTrackingPixelsFromHtml(...)
```

## Settings UX

Placement: Settings > Extensions, under `Email Enhancements`.

Recommended simplified labels:

Send-side tracking:

- EN label: `Email open tracking`
- EN description: `Show when sent emails are opened.`
- ZH label: `邮件打开追踪`
- ZH description: `查看已发送邮件是否被打开。`

Receive-side blocking:

- EN label: `Block tracking pixels`
- EN description: `Hide tiny tracking images in received emails.`
- ZH label: `拦截追踪像素`
- ZH description: `隐藏收到邮件中的微型追踪图片。`

Control behavior:

- Use `ToggleSwitch` or the existing Extensions page dropdown pattern, whichever matches adjacent rows at implementation time.
- These are global feature switches.
- Send-side tracking must not inject any pixel when disabled.
- Receive-side blocking must not strip third-party pixels when disabled.

Setting scope:

- Use a real global user/team setting. If an existing global extension settings store exists, reuse it.
- Do not fake a global switch with per-link settings.
- Keep `email_settings.read_receipts_enabled` as the existing per-inbox/link setting.
- The user-facing Extensions page must behave as one global switch.

## Sent Message Status UX

Placement:

- Message list row for messages sent by the current user.
- Expanded sent message header/body area, below sender/date metadata or near the existing sent-message controls.

Recommended compact labels:

- No status / not opened: `Not opened yet`
- First opened: `Opened {time}`
- Multiple opens: `Opened {time} · {count} times`
- Tracking disabled: `Open tracking off`
- Unsupported/plain-text/no token: hide the status unless a disabled state is useful in settings/debug.

Chinese:

- No status / not opened: `尚未打开`
- First opened: `{time} 已打开`
- Multiple opens: `{time} 已打开 · {count} 次`
- Tracking disabled: `打开追踪已关闭`

Use existing date formatting and i18n interpolation. Do not build strings by concatenating translated fragments.

## Tracking Pixel Blocking

Goal: reduce received-mail tracking without breaking ordinary email rendering.

MVP rules:

- Strip or suppress `<img>` elements with 1x1 dimensions.
- Strip Macro `/t/o/` pixels.
- Strip images with inline CSS that forces both dimensions to 1px.
- Preserve CID images and normal remote images.

Out of MVP:

- Hidden CSS detection such as `display:none`, `visibility:hidden`, and `opacity:0`.
- Third-party commercial tracker lists.

Add those only after corpus tests and false-positive review.

Implementation preference:

- Perform receive-side blocking in frontend inert HTML before image proxy rewriting, mirroring the existing safe sent-mail stripping path.
- Later, if needed, add backend sanitization for stored display HTML, but do not mutate original raw provider HTML.

Status UI:

- Do not show per-email "blocked pixel" banners in MVP.
- If needed for debug, expose count only behind a developer/debug affordance.

## Dynamic Activity Integration

Current Macro activity surfaces already support entity timelines and side-panel activity sections. For pixel tracking, add a read-receipt event only when it creates useful business context.

MVP activity behavior:

- Emit first-open activity only: `Email opened`.
- Do not emit repeat-open activity in MVP.
- Do not emit activity for every image fetch; mail clients can prefetch repeatedly.
- Derive first-open from the atomic DB transition where `first_opened_at IS NULL`, not from `open_count == 1`.

DB contract:

```rust
struct OpenResult {
    open_count: i64,
    is_first_open: bool,
}
```

Entity attachment:

- Subject entity: email thread.
- Related entity: message.
- Actor: external recipient is unknown, so use a system/anonymous open actor rather than pretending the recipient identity is verified.

Right-side Dynamic Tracking panel copy:

- Empty: keep existing `No activity yet`.
- First open row EN: `Email opened`
- First open row ZH: `邮件已打开`
- Detail EN: `Opened from tracking pixel`
- Detail ZH: `通过追踪像素记录`

Important limitation:

Pixel opens do not prove a human read the email. They prove a mail client or proxy fetched the pixel. UI must say `opened`, not `read by recipient`, unless recipient identity is later verified.

## i18n Requirements

All new user-visible text must use `t()` or existing i18n helpers.

Add keys for:

- `Email open tracking`
- `Show when sent emails are opened.`
- `Block tracking pixels`
- `Hide tiny tracking images in received emails.`
- `Not opened yet`
- `Opened {time}`
- `Opened {time} · {count} times`
- `Open tracking off`
- `Email opened`
- `Opened from tracking pixel`

Chinese translations:

- `邮件打开追踪`
- `查看已发送邮件是否被打开。`
- `拦截追踪像素`
- `隐藏收到邮件中的微型追踪图片。`
- `尚未打开`
- `{time} 已打开`
- `{time} 已打开 · {count} 次`
- `打开追踪已关闭`
- `邮件已打开`
- `通过追踪像素记录`

Avoid the phrase `对方已读`. It overclaims. Use `已打开` / `opened`.

## Data Model

Existing:

- `email_messages.open_tracking_token`
- `email_messages.first_opened_at`
- `email_messages.last_opened_at`
- `email_messages.open_count`
- `email_settings.read_receipts_enabled`

Needed for global Extensions switches:

- Add a global extension settings table, or reuse an existing team/user settings table if one already exists.
- Store:
- `email_open_tracking_enabled`, default `true`
- `email_tracking_pixel_blocking_enabled`, default `false`

Migration rule:

- Do not modify existing migration `20260902003000_email_read_receipts.sql`.
- Add a new SQLx migration for global extension settings.

Do not overload `email_settings.read_receipts_enabled` if the UI is global. Keep per-link and global semantics explicit.

Effective send-side enabled logic:

```text
global email_open_tracking_enabled
AND inbox read_receipts_enabled
AND message is outgoing HTML
```

Effective receive-side blocking logic:

```text
global email_tracking_pixel_blocking_enabled
AND message is received
AND rendered HTML contains matching tracking-pixel candidates
```

## Implementation Phases

0. Behavior baseline and double gate.
   - Record current send tracking API, DB, and UI behavior.
   - Add or verify `PRIVATE-HOOK` hard gate.
   - Add or verify upstream overlap CI.
   - Record current upstream/private diff before refactor.

1. Pure path normalization and thin hooks.
   - Move code into feature directories.
   - Preserve behavior exactly.
   - Add `PRIVATE-HOOK` markers and register them in `.fork/private-hooks.yml`.
   - Make upstream-owned files contain only thin 1-3 line hooks.
   - Pass `just private-hook-check` and overlap CI.
   - Prohibit behavior changes, UI copy changes, DB schema changes, and mass formatting in this phase.

2. Global Extensions settings.
   - Add true global API + DB settings.
   - Add UI rows under Extensions > Email Enhancements.
   - Add i18n keys.
   - Preserve existing per-inbox `email_settings.read_receipts_enabled`.
   - Use effective send-side logic: global setting AND inbox setting AND outgoing HTML.

3. Sent Status UX Normalization.
   - Move status component into `apps/web/src/features/email-read-receipts/`.
   - Show compact status below or near current user's sent messages.
   - Keep wording to `opened`, not `read`.

4. Receive-side pixel blocking.
   - Add conservative HTML detector.
   - Apply before image proxy rewriting.
   - Keep debug count optional.

5. Dynamic Activity.
   - Record first-open event only.
   - Surface in entity activity / Dynamic Tracking panel.
   - Use atomic DB first-open result.

6. Full-chain verification.
   - Verify send tracking enabled/disabled.
   - Verify inbox setting still gates send-side tracking.
   - Verify received pixel blocking enabled/disabled.
   - Verify first-open activity is emitted once.
   - Verify upstream overlap CI and private-hook gate both pass.

## Verification

Focused checks:

- Rust formatting: `cargo fmt --check`
- Email service compile: `cargo check -p email_service -p email_db_client`
- Utility tests: `cargo test -p email_utils read_receipts`
- Frontend tests for `apps/web/src/features/email-read-receipts`
- `just private-hook-check`

Local agent-driven E2E verification:

1. Start the local development stack with `email_service` and MacroDB.
2. Enable global `email_open_tracking_enabled`.
3. Enable the current inbox `email_settings.read_receipts_enabled`.
4. Send one HTML email through Macro's own email API. A test recipient such as `test@test.com` is acceptable if the provider accepts the send request.
5. Query MacroDB for the latest outgoing message and verify:
   - `open_tracking_token` is present.
   - `first_opened_at` is `NULL`.
   - `last_opened_at` is `NULL`.
   - `open_count = 0`.
6. Simulate the recipient opening the message by curling the tracking URL:

```bash
curl -i http://localhost:<email_service_port>/t/o/<open_tracking_token>
```

7. Query MacroDB again and verify:
   - `first_opened_at` is set.
   - `last_opened_at` is set.
   - `open_count = 1`.
8. Curl the same tracking URL again and verify:
   - `first_opened_at` is unchanged.
   - `last_opened_at` is updated.
   - `open_count = 2`.
   - Dynamic Activity does not create a duplicate first-open event.

Do not call Gmail directly and do not write tracking fields manually in DB for this E2E path. The test must go through Macro's send API so the send hook, DB token write, public tracking route, and status update are verified together.

When SQL changes:

- Run migrations locally.
- Run `nix develop --command just prepare_db` from repository root.

When UI changes:

- Verify Settings > Extensions in desktop and narrow viewport.
- Verify sent-message status on a sent email with no opens and with at least one recorded open.
- Verify received email rendering with and without pixel blocking.

## Upstream Sync Protection

Gate responsibilities:

- Overlap CI discovers upstream intrusion into fork-owned customization areas.
- `PRIVATE-HOOK` gate hard-protects the exact private integration points embedded in upstream-owned files.

These gates are complementary. Overlap CI is a review signal for broad affected paths; `PRIVATE-HOOK` is a blocking guard for thin hooks that must not disappear or drift silently.

Every upstream-owned hook must be marked and registered:

```yaml
hooks:
  - id: email-read-receipts-send
    file: services/email_service/src/util/gmail/send.rs
    marker: "PRIVATE-HOOK: read_receipts:send"
    expected: "read_receipts::prepare_outgoing_message"
    context:
      - "MessageToSend"
```

Run:

```bash
just private-hook-check
```

Failure means the upstream merge probably removed or invalidated a private integration point and must be reviewed manually.
