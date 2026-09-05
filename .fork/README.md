# Private fork customizations

`customizations.yml` is the machine-readable inventory of behavior that must survive an upstream synchronization. It complements focused `CUSTOM(<area>): ...` commits and rare inline `FORK-CUSTOM: <ID>` markers.

Update an entry whenever its behavior, paths, risk, or validation changes. The upstream-sync workflow validates this file and reports which customization areas overlap a synchronization PR.

Run the checker locally with:

```bash
ruby .github/scripts/check-upstream-overlap.rb --base upstream/main --head HEAD
```
