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

## Conflict procedure

1. Read customizations, private-hooks, retirements, upstream anchor, and relevant
   Fork packages before resolving.
2. Use current upstream file content as the implementation base.
3. Reinject only the smallest still-required Hook and adapt it to current upstream
   APIs; do not restore an obsolete Fork copy.
4. Keep complete Fork implementations in `packages/fork/**`.
5. If upstream now provides equivalent behavior, remove the duplicate Fork path
   after regression verification and retire its Hook/ownership.
6. Regenerate generated artifacts only after source semantics are settled.
7. Review no-conflict overlaps as well as Git conflicts.

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
