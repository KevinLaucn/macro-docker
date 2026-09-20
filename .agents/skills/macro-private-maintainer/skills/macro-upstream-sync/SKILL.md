---
name: macro-upstream-sync
description: Merge macro-inc/macro upstream changes into the long-lived private fork. Use for sync branches, upstream conflict resolution, historical drift cleanup, private-hook reinjection, and post-merge parity verification.
---

# Macro Upstream Sync

Start from upstream behavior, then reapply only explicit Fork behavior. Never
preserve a historical edit merely because it exists or compiles.

## Target and ancestry

Create `sync/upstream-*` from main. Read `.fork/upstream.yml` for the last
merged upstream SHA, fetch the selected target (normally `upstream/main`), record
its exact SHA, merge it, and preserve ancestry. Never rebase away the upstream
merge.

After the merge, update `.fork/upstream.yml` to the exact target SHA. Strict
sync validation requires that SHA to be an ancestor of HEAD.

## Required review

Before merge:

`git diff --name-status <last-merged-upstream>..<target-upstream>`

After conflict resolution:

`git diff --name-status <target-upstream>..HEAD`

For the second diff:
- `customizations.yml.paths` only says what to watch/test;
- every intentional upstream-owned source difference needs its exact path in
  `owned_paths`, or a registered exact override;
- every PRIVATE-HOOK declares one semantic customization owner;
- deleting or relocating an upstream file is a failure, not an integration strategy;
- upstream-provided Skill directories must be fully 0 diff.

Do not independently fix non-blocking upstream bugs. A blocker-only patch needs
exact ownership, regression coverage, and retirement evidence.

## 7-Step Upstream Sync Procedure

Every merge from `upstream/main` must follow this 7-step workflow:

1. **Diff Upstream**: Inspect incoming changes via `git diff --name-status <last-merged-upstream>..<target-upstream>`.
2. **Check Fork Files**: Verify whether fork-owned files or `.fork/` definitions were directly touched or have conflicts.
3. **Trace Upstream Integration Seams & Dependencies**:
   Inspect whether upstream interfaces, data structures, schemas, or call chains depended on by fork customizations have shifted (e.g. backend photo attributes, contact serialization, auth claims, tracking routes).
4. **Adapt Affected Customizations**:
   Adapt fork packages (`packages/fork/`) to the new upstream schemas and contracts, adhering strictly to zero core drift in upstream source files.
5. **Run Fork Contract Gate**:
   Execute contract and unit tests for every affected customization (e.g. `identity.test.ts`, read-receipts query tests) to ensure private features are not silently broken.
6. **Run Self-host Smoke Gate**:
   Execute smoke tests for official core capabilities under self-hosted infrastructure (e.g. paste screenshot upload, presigned S3 URLs, public asset access, email webhooks/pixels).
7. **Complete Governance Validation**:
   Validate that `just private-hook-check` (exact hook context) and `check-core-drift.rb` pass with 0 unauthorized drift before concluding sync.

## Two-Gate Acceptance Criteria

### 1. Fork Contract Gate
- **Focus**: Customization integrity across integration seams.
- **Rule**: "No diff in fork-owned files does not mean the customization is preserved."
- **Verification**: Run declared contract tests in `customizations.yml`. Verify that UI components, API mappers, and backend adapters correctly handle upstream payload changes.

### 2. Self-host Smoke Gate
- **Focus**: Upstream official core capabilities in the self-host environment.
- **Rule**: Upstream code changes must not break self-hosted operational contracts or fallback to unreachable endpoints (e.g. LocalStack `localhost:4566` or internal container hostnames).
- **Verification**: Verify critical paths:
  - Screenshot / file upload: static file upload → presigned S3 URL → storage bucket → public read.
  - Email open tracking / webhooks: public gateway routing (`/t/*`) → backend service port.
  - Domain configuration: service hostnames resolve correctly without hardcoded localhost fallbacks.

## Finalize governance

After semantic review:

```bash
ruby .github/scripts/check-core-drift.rb \
  --upstream upstream/main \
  --write-snapshot

CHECK_BASE=upstream/main FORK_SYNC_STRICT=1 just fork-gate
```

The v2 snapshot must describe the current tree exactly; never preserve stale
entries from an older sync.

Run every targeted test group reported by the overlap gate. Release/production
acceptance additionally requires the applicable full build/image validation.

## Report

Report target SHA, pre-sync SHA, merge ancestry, official Skill directory parity,
conflicts and historical drift removed, ownership/Hook/retirement changes, v2
core-drift count, tests run, and any environment-blocked checks.
