---
name: macro-upstream-sync
description: Safely merge macro-inc/macro upstream changes into the long-lived private fork. Owns upstream-sync semantics, conflict decisions, customization preservation, and sync reporting.
---

# Macro Upstream Sync

This is the only Skill that defines upstream-merge semantics. The repository's
machine checks are owned by `just fork-gate`; do not reproduce its internal
Ruby commands here or in workflows.

## Non-negotiable intent

- Preserve upstream capability and private-fork behavior together whenever they
  express different concepts.
- Never silently change product behavior, permissions, data meaning, state
  machines, API contracts, self-host topology, or privacy boundaries.
- A mechanical change is one whose before/after behavior is demonstrably
  equivalent: path/import rename, signature adaptation, formatter change, or a
  source-confirmed generated artifact. Mechanical work may proceed continuously.
- Stop and ask only when business semantics, permissions, data behavior,
  security/privacy boundaries, or the intended combination is genuinely
  uncertain. A compile fix is not automatically a semantic fix.
- Never use `ours`/`theirs` merely because it compiles or has more changes.

## Fork boundary

Complete fork features belong in `packages/fork/<feature>/`. A small semantic
compatibility patch may stay in an upstream-owned file when it is the smallest
safe integration. Such a patch is incomplete until all four links exist:

1. a minimal, uniquely marked `PRIVATE-HOOK`;
2. a matching `.fork/customizations.yml` entry with affected paths and tests;
3. a targeted regression test; and
4. a `.fork/retirements.yml` condition when upstream may absorb the behavior.

Fixed, exact replacements belong in `.fork/overrides/`. `just fork-gate`
checks the machine-verifiable parts, but it does not decide whether a semantic
patch needs a hook or whether its retirement evidence is sufficient. Make that
judgment during sync review. The manifests and `docs/FORK_DEVELOPMENT.md` are
the governance record; update them when behavior, paths, risk, or tests change.

## Branch and target

Use a dedicated `sync/upstream-*` branch created from the current `main`; do
not modify or push `main` during the sync. Merge the selected upstream ref and
preserve the merge commit. Finish through a PR back to `main`; do not rebase
the sync branch to erase the upstream merge.

Default target is `upstream/main`. If the user names a release tag, record its
tag and commit and state that later upstream commits are excluded. Record the
pre-sync `main` SHA, target SHA, and final branch/PR.

## Procedure

1. Inspect status, branch, remotes, target ref, and current divergence. Read
   `.fork/customizations.yml` before merging.
2. Create `sync/upstream-*`, then merge the target ref. Resolve Git conflicts
   only when the result is mechanical. For semantic conflicts, report the
   upstream behavior, fork behavior, affected user/data/security boundary, and
   the smallest candidate combinations; wait for the user's decision.
3. Review both the Git-conflict set and the no-conflict overlap between the
   upstream diff and customization manifest. Use CodeGraph for affected symbol
   callers/callees/impact and `rg` for literal/config/Hook checks.
4. Confirm source behavior before regenerating `.sqlx`, OpenAPI, GraphQL,
   schema, or TypeScript artifacts. Never edit generated output to decide
   business behavior.
5. Run `just fork-gate`, then targeted tests for affected groups. Run full
   production/image validation for release or production acceptance. The gate
   is mandatory even when Git reports no conflicts.
6. Review the final sync-branch diff against `main`, update manifests if
   required, and produce the report below. Do not perform unrelated cleanup or
   refactoring.

## Protected semantic areas

Inspect overlap carefully when changes touch Email/Gmail workflows or status,
CRM/contact identity, authentication/FusionAuth/OAuth/roles/permissions,
database schema/migrations/defaults/nullability, API status/error/fallback
meaning, self-host service discovery/URLs/feature flags, privacy/telemetry,
i18n/user-visible strings, or build/release/SQLx/Nix contracts. These labels
identify review areas; they do not mean every textual change requires a pause.

## Failure policy

Do not resolve a test or build failure by disabling a feature, weakening auth,
adding a cloud fallback, swallowing errors, returning fake empty values,
skipping migrations/validation, changing tests to bless an unknown behavior, or
deleting an upstream feature. Attribute the failure to upstream, fork, or
interaction; fix only the sync-related issue.

## External actions

Analysis, local branch edits, tests, and gate execution are allowed within the
task. Push, PR creation, approval, merge, deployment, force-push, or closing a
PR requires explicit user intent.

## Sync report

Report:

- target mode (`upstream/main` or release tag), target SHA, pre-sync SHA;
- branch/PR and whether the upstream merge commit was preserved;
- customization areas overlapped and manifest updates;
- semantic conflicts and user decisions, or explicitly “none”;
- generated artifacts and targeted/full/production checks with results;
- GitHub behind status relative to the selected target, when available;
- remaining risks or blocked environment-dependent checks.
