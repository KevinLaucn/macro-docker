# Private fork customizations

`customizations.yml` is the machine-readable inventory of behavior that must survive an upstream synchronization. It complements focused `CUSTOM(<area>): ...` commits and rare inline `FORK-CUSTOM: <ID>` markers.

The development boundary is documented in [`docs/FORK_DEVELOPMENT.md`](../docs/FORK_DEVELOPMENT.md): complete fork features belong in `packages/fork/<feature>/`; small semantic patches may remain upstream-owned with a registered hook. This directory contains governance manifests and mechanical overrides.

Update an entry whenever its behavior, paths, risk, or validation changes. The upstream-sync workflow validates this file and reports which customization areas overlap a synchronization PR.

Run the unified machine gate locally with:

```bash
just fork-gate
```
