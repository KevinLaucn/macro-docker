---
name: macro-pre-push-gate
description: Push and release gatekeeper for the private Macro fork. Use before push, PR, upstream-sync completion, release, or explicit build-contract validation.
---

# Macro Pre-push & Release Gate

Use repository-native checks and keep the gate proportional to changed scope.

## Required gate

Run `just fork-gate` first. It is the sole machine source for fork governance,
including hook/override/retirement checks, zero-cloud/privacy rules, upstream
overlap, upstream Skill parity, and unexplained core drift.

A sync/release is blocked when:
- an upstream-provided Skill differs from the selected upstream target;
- an upstream-owned source diff has no explicit fork classification;
- a PRIVATE-HOOK is missing, duplicated, stale, or detached from its owner;
- a temporary upstream fix has reached its retirement condition.

For changed Rust SQL verify SQLx offline parity. For frontend changes run scoped
`just check`; use full checks for shared/core or broad changes. Run targeted
tests for every affected customization. Release/production work additionally
requires the applicable production/image validation.

## Branch rules

Normal development targets the current feature branch. Upstream sync uses
`sync/upstream-*` and preserves upstream merge ancestry. Never use a direct
main push for sync work.

## Failure handling

Stop on gate failure. Classify it as upstream, fork, or interaction before
editing. Do not pass by disabling validation, weakening permissions, swallowing
errors, adding cloud fallback, deleting a feature, or blessing unexplained drift.

## Report

Report branch/PR target, upstream target SHA when relevant, exact checks run,
results, and blocked environment-dependent verification.