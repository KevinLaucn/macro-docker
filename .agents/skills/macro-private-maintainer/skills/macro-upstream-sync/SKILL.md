---
name: macro-upstream-sync
description: Merge macro-inc/macro upstream changes into the long-lived private fork. Use for sync branches, upstream conflict resolution, historical drift cleanup, private-hook reinjection, and post-merge parity verification.
---

# Macro Upstream Sync

This Skill owns upstream merge semantics. Upstream-provided Skills remain
byte-identical to the selected upstream target; fork policy lives only in the
private maintainer hierarchy.

## Core rule

Start from upstream behavior, then reapply only explicit fork behavior.

Do not preserve a historical fork edit merely because it exists or compiles.
If an upstream-owned difference cannot be tied to a current customization,
hook, override, self-host invariant, or blocker patch, restore upstream.

Do not independently fix non-blocking upstream bugs during sync. Preserve the
official behavior and wait for upstream. A blocker-only patch requires hook,
customization, targeted regression test, and retirement evidence.

## Branch and target

Use `sync/upstream-*` from current main. Default target is `upstream/main`.
Record pre-sync main SHA and exact upstream target SHA. Merge the target and
preserve upstream ancestry; never rebase away the merge commit.

## Required two-diff review

Before merge:
`git diff --name-status <last-upstream-sha>..<upstream-target>`
answers what upstream changed.

After conflict resolution:
`git diff --name-status <upstream-target>..HEAD`
answers what the fork still changes.

Every upstream-owned path in the second diff must be classified as one of:
- registered PRIVATE-HOOK integration;
- registered customization;
- exact override;
- generated artifact derived from authoritative source;
- temporary blocker patch with retirement entry.

Anything else is unexplained core drift and blocks completion.

## Conflict procedure

1. Read `.fork/customizations.yml`, `.fork/private-hooks.yml`,
   `.fork/retirements.yml`, and the relevant fork package before resolving.
2. For upstream-owned files, take current upstream as the base implementation.
3. Reinject only the smallest currently-required fork hook. Adapt the hook to
   upstream's current API rather than restoring an obsolete fork copy.
4. Preserve complete fork implementations in `packages/fork/**` unless upstream
   now provides equivalent behavior; if equivalent, mark retirement and remove
   the duplicate after regression verification.
5. Restore every upstream-provided `.agents/skills/**` file exactly from the
   selected target. Never carry fork policy inside those files.
6. Regenerate SQLx/OpenAPI/GraphQL/TypeScript only after source semantics are
   settled. Generated files do not decide conflicts.
7. Review non-conflicting overlaps too; Git conflict absence is not semantic proof.

For a real semantic collision involving permissions, data meaning, privacy,
authentication, or business behavior, compare upstream and fork behavior and
choose the smallest composition consistent with declared fork requirements.
Do not choose ours/theirs based on diff size.

## Historical drift cleanup

Treat old deletions, defensive fallbacks, copied upstream files, and broad
CORE-ADAPTATION entries as migration debt. During each sync:
- restore upstream when no current fork requirement exists;
- move complete private behavior into `packages/fork/**`;
- reduce upstream files to narrow hooks;
- replace broad classifications with explicit ownership;
- remove obsolete hooks/retirements after upstream equivalence is verified.

## Validation

Run `just fork-gate`, then test every customization group overlapped by the
sync. Release/production acceptance additionally requires applicable production
image/build checks. Do not weaken a gate to make a sync pass.

## Report

Report target SHA, pre-sync SHA, preserved merge ancestry, upstream Skills parity,
conflicts resolved, remaining classified upstream-owned drift, customization and
retirement changes, checks run, and blocked checks.