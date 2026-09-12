# Private fork customizations

`customizations.yml` is the machine-readable inventory of behavior that must survive an upstream synchronization. It complements focused `CUSTOM(<area>): ...` commits and rare inline `FORK-CUSTOM: <ID>` markers.

The development boundary is documented in [`docs/FORK_DEVELOPMENT.md`](../docs/FORK_DEVELOPMENT.md): fork feature implementations belong in `packages/fork/<feature>/`, while this directory contains only governance, hook manifests, and mechanical overrides.

Update an entry whenever its behavior, paths, risk, or validation changes. The upstream-sync workflow validates this file and reports which customization areas overlap a synchronization PR.

Run the checker locally with:

```bash
ruby .github/scripts/check-upstream-overlap.rb --base upstream/main --head HEAD
ruby .github/scripts/check-fork-overrides.rb --check
ruby .github/scripts/check-fork-retirements.rb --upstream upstream/main
ruby .github/scripts/check-zero-cloud.rb --base upstream/main --head HEAD
ruby .github/scripts/check-telemetry-privacy.rb --base upstream/main --head HEAD
```
