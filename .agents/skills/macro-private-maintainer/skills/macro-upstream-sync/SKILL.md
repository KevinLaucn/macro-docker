---
name: macro-upstream-sync
description: Safely synchronize macro-inc/macro upstream changes into the long-lived private fork. Use for upstream merges, sync branches or PRs, fork-divergence review, customization-overlap analysis, and post-sync verification.
---

# Macro Upstream Sync

Treat upstream synchronization as a reviewed change, not a routine merge. The goal is to preserve private-fork behavior even when Git reports no textual conflict.

## Required inputs and invariants

- Work from the repository root and confirm the `upstream` remote resolves to `macro-inc/macro` before fetching or merging.
- Preserve unrelated working-tree changes. Never begin a merge in a dirty tree unless the user explicitly chooses how those changes should be isolated.
- Never merge upstream directly into the production `main` branch. Use a dedicated `sync/upstream-YYYY-MM-DD` branch and a sync PR.
- Read `.fork/customizations.yml` before resolving conflicts or accepting upstream implementations.
- A path overlap is a review signal, not proof of a semantic conflict. A clean Git merge is not proof that a customization still works.
- Do not rewrite existing fork history merely to manufacture a clean patch stack. Keep future fork changes in focused `CUSTOM(<area>): ...` commits when practical.

## Sync workflow

1. Inspect `git status`, remotes, the current branch, and the divergence between `upstream/main` and the fork branch.
2. Fetch `upstream` only when the user has authorized performing the synchronization or explicitly asks for current remote state. Read-only planning may use the existing remote-tracking ref and must state its timestamp.
3. Create or use a dedicated sync branch. Record the pre-sync fork commit.
4. Run `ruby .github/scripts/check-upstream-overlap.rb --base <pre-sync-commit> --head upstream/main` to identify customization areas changed by upstream.
5. For every hit, inspect the actual call paths with CodeGraph before deciding whether upstream or fork behavior wins. Give `high` risk entries explicit human review.
6. Merge `upstream/main` with a merge commit. Do not silently discard either side of a conflict.
7. Re-run the overlap checker across the sync PR diff and execute every reported test group through the upstream-sync workflow.
8. For direct edits to upstream core semantics, add or preserve the manifest ID in a nearby `FORK-CUSTOM: <ID>` comment when the language supports a comment without harming generated code.
9. Run `codegraph sync /Volumes/开发/macro` after code changes, then apply the main maintainer skill's global validation gates.
10. Report the upstream range, overlapping customization IDs, conflict decisions, tests run, and any unresolved risk in the sync PR.

## Maintaining the customization manifest

Update `.fork/customizations.yml` in the same change whenever a customization is introduced, removed, renamed, or changes paths/tests. Each entry must have:

- a stable uppercase ID;
- an owner-facing title and rationale;
- `low`, `medium`, or `high` risk;
- narrow repository-relative glob paths;
- one or more CI test-group identifiers supported by `.github/workflows/upstream-sync.yml`.

Prefer feature boundaries over broad directories. Do not use `**` alone or register the whole repository. Markers are optional and reserved for core semantic patches; adapters and fork-owned files usually do not need inline markers.

## Stop conditions

Stop and ask for direction when a conflict changes product behavior, data compatibility, privacy boundaries, authentication, or production topology and the intended winner is not evident from the manifest and current code. Do not push, open, approve, or merge a PR unless the user requested that external action.
