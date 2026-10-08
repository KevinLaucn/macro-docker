# Browser runtime regression contract

Owner: `BROWSER-RUNTIME-COMPAT-001` and `SELFHOST-RUNTIME-001`.

Keep patches small. Do not mask errors with fake HTTP 200 responses or disable
working capabilities. Retire patches when upstream passes the same tests.

## Automated checks

Run `just test-browser-runtime` (also included in `just fork-gate` and the
upstream-sync web test group). It verifies:

- Recommendation titles accept 180 characters and reject 181; the AI schema
  description still requests plain-text titles of at most 160 characters.
- Missing keyboard keys do not throw.
- Disabled agents do not request models or capabilities even if callers enable
  the query; enabled-agent behavior remains covered.

`verify-release.py` must retain the Compose bootstrap assertion for
`/app/env-config.js`. Inspect HTML to ensure configuration loads before the
application bundle. Changes to schemas, query callers, capability mapping,
feature flags or runtime bootstrap require semantic review, not just markers.

## Production acceptance after an update

Use the actual configured browser session. Check runtime capabilities, home,
settings and Important/Other/Sent/Drafts/All mail switches. When agents are
disabled, no `/agent-harness/*` or `/auth/codex` requests may occur. Record new
application exceptions and failed requests separately from browser extensions
and expected unavailable-link responses. Record switching time, without a
fixed latency threshold that depends on network and mailbox size.

Exercise one AI response to completion. The optional-provider router patch is
pending backend deployment and Rust validation; frontend checks must never be
reported as proof that AI conversation works. A missing optional provider must
not prevent configured providers from initializing.

Static production hotpatches must be backed up and mirrored in repository code.
They do not replace a reproducible release; verify again after image updates.
