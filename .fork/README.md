# Private fork governance

`.fork/` is the machine-readable control plane for this long-lived fork. The
runtime implementations stay in `packages/fork/<feature>/` or the documented
self-host infrastructure; upstream-owned source keeps only the smallest required
integration points.

## Manifests

- `customizations.yml`
  - `paths`: review/test watch scope. It may be broad so upstream changes in a
    sensitive area trigger semantic review and targeted tests.
  - `owned_paths`: exact upstream-owned files intentionally allowed to differ.
    Wildcards are forbidden. A broad watch scope never authorizes broad drift.
- `private-hooks.yml`: every hook declares one `customization` owner, one
  upstream file, a unique marker, expected code, and context anchors.
- `overrides/`: deterministic exact replacements for simple fixed values.
- `retirements.yml`: temporary fork behavior that must be removed when upstream
  provides equivalent behavior.
- `upstream.yml`: exact upstream SHA last merged into `main`.
- `remaining-core-diffs.yml`: derived v2 snapshot of every upstream-owned file
  still different from that SHA. Do not use it as an allowlist and do not hand
  preserve stale entries.

Regenerate the drift snapshot only after reviewing ownership:

```bash
ruby .github/scripts/check-core-drift.rb --upstream <target> --write-snapshot
```

Then run the unified machine gate:

```bash
just fork-gate
```

Normal development defaults to the SHA recorded in `.fork/upstream.yml`.
Upstream-sync CI explicitly compares against live `upstream/main` and requires
that target to be an ancestor of the sync branch.

The full development and synchronization policy is in
[`docs/FORK_DEVELOPMENT.md`](../docs/FORK_DEVELOPMENT.md).
