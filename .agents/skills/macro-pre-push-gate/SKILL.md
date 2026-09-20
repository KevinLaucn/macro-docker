---
name: macro-pre-push-gate
description: Push and release gatekeeper for the private Macro fork. Use before push, PR, upstream-sync completion, release, or explicit build-contract validation.
---

# Macro Pre-push & Release Gate

Run `just fork-gate` first. Normal development uses the recorded upstream SHA
from `.fork/upstream.yml`; upstream-sync CI sets live `upstream/main` and strict
ancestry.

The unified gate must reject:
- any difference anywhere inside an upstream-provided Skill directory;
- deletion of an upstream-owned file;
- upstream source drift without an exact customization `owned_path` or override;
- stale `owned_paths` or stale/missing v2 core-drift snapshot entries;
- PRIVATE-HOOK entries without one explicit semantic customization owner;
- missing/duplicated Hook markers or broken expected/context anchors;
- retirement candidates that require deliberate review;
- zero-cloud/privacy violations.

For changed Rust SQL verify SQLx offline parity. For frontend work run scoped
`just check`; use full checks for shared/core or broad changes. Run targeted
tests for every affected customization. Release/production work additionally
requires the applicable production/image validation.

Normal development targets its feature branch. Upstream sync targets
`sync/upstream-*`, preserves upstream ancestry, and reaches main through PR.
Never make a direct sync push to main.

On failure, classify upstream/Fork/interaction before editing. Never pass by
weakening validation, permissions, privacy boundaries, tests, or by deleting an
upstream feature.

Report target branch/PR, upstream SHA, exact checks and targeted tests run, and
any blocked environment-dependent verification.
