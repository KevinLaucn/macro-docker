---
name: macro-pre-push-gate
description: Push and release gatekeeper for Macro. Selects proportional checks and requires the repository's unified fork gate without prescribing a push target.
---

# Macro Pre-push & Release Gate

Use this Skill only for a push, PR, release, or explicit build-contract check.
Fork structure is defined by the maintainer Skill and `docs/FORK_DEVELOPMENT.md`.

## Required gates

1. Run `just fork-gate`. This is the sole machine source for private hooks,
   overrides, retirements, zero-cloud, telemetry privacy, and overlap checks.
2. For changed Rust SQL, verify SQLx cache parity with the repository's
   documented prepare flow and `SQLX_OFFLINE=true cargo check -p <crate>`.
3. For changed frontend code, run the scoped `just check`; use `just check full`
   only for core types, shared infrastructure, or broad changes.
4. Run targeted tests for affected packages. Sync/release work additionally
   requires the applicable production/image build and workflow checks.

Do not copy the Ruby commands behind `just fork-gate` into this Skill or a
workflow. Do not treat a local targeted check as production parity.

## Branch and push rules

普通开发推送当前 feature branch；upstream sync 使用 `sync/upstream-*` 分支和
PR。Sync branch must preserve the upstream merge commit; do not rebase it away.
The default target is the current branch/PR, never a direct push to `main`.
External push, PR, merge, or release actions still require explicit user intent.

## Failure handling

Stop on a failed gate. Attribute failures to upstream, fork, or interaction
before changing code. Do not repair a failed check by disabling it, hiding an
error, weakening a permission, adding a cloud fallback, or deleting a feature.

## Report

Report the branch/PR target, exact checks run, results, and any blocked
production or environment-dependent verification.
