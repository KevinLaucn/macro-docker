---
name: macro-private-maintainer
description: Master router for maintaining the long-lived private Macro fork. Preserves zero Macro cloud dependency, fork safety, local data safety, and production build boundaries.
---

# Macro Private Maintainer

This is the repository-wide policy entrypoint, not a copy of every domain
workflow. Load the routed Skill before acting; that Skill owns its procedure.

## Tool choice

Use current repository state, code, tests, scripts, and workflows as evidence.
When `.codegraph/` exists, start symbol investigations with
`codegraph explore`; use `callers`/`callees` for the relationship chain and
`impact` for the likely change scope. Use the task-oriented commands when they
reduce guesswork:

- `codegraph context "<task>"` for cross-file task context before planning;
- `codegraph node <symbol-or-file>` for one symbol/file and its neighbors;
- `codegraph affected <changed-files>` for the likely affected tests;
- `codegraph explore` for natural-language, path, camelCase, variable, and
  constant-oriented discovery.

If the index is missing, stale, or insufficient, read the source and
supplement with `rg`. Use `rg` directly for URLs, configuration,
`PRIVATE-HOOK` markers, Docker/Nix literals, and other text search. Use
`cargo tree` for Cargo feature and dependency questions.

## Routing

| Task | Skill |
| --- | --- |
| Rust domain/inbound/outbound work | `../cloud-storage-hexagonal-architecture/SKILL.md` |
| New or changed AI Tool | `../create-ai-tool/SKILL.md` |
| Local stack, Docker, ports, CI parity | `skills/macro-local-environment/SKILL.md` |
| Schema, migrations, or database inspection | `../dump-schema/SKILL.md` and the database guide |
| Debugging an already running stack | `../live-debug/SKILL.md` |
| Debugging one Rust binary without a full stack | `../debug-service/SKILL.md` |
| UI/UX under `apps/web` | `skills/macro-ui-design/SKILL.md` |
| Upstream merge, sync branch, conflict review | `skills/macro-upstream-sync/SKILL.md` |
| i18n extraction/audit | `references/i18n-workflow.md` |
| Production deployment/operations | `references/production-deployment.md` |
| Dependabot/dependency alerts | `../dependabot/skill.md` |
| Model registry/provider changes | `../upgrade-model/SKILL.md` |
| Push, PR, release, offline/build contract | `../macro-pre-push-gate/SKILL.md` |
| Release review or explicit QC | `../qc/SKILL.md` |

Also read the relevant directory `AGENTS.md`/`CLAUDE.md`, `docs/STYLE_GUIDE.md`,
and the repository guide before editing. For fork governance, the facts are
`.fork/`, `docs/FORK_DEVELOPMENT.md`, `tooling/just/check.just`, and the
corresponding GitHub workflow.

## Cross-task invariants

1. **Zero Macro cloud:** never send private user data to `*.macro.com` or add
   an implicit cloud fallback. Self-host paths must remain explicit and local.
2. **Data and credential safety:** never commit real secrets, tokens, private
   keys, or production credentials. Destructive local/database actions require
   explicit user intent and must preserve FusionAuth/MacroDB consistency.
3. **Fork boundary:** complete fork features belong in
   `packages/fork/<feature>/`; mechanical exact replacements belong in
   `.fork/overrides/`. Upstream-owned semantic patches follow the complete
   registration rule in `macro-upstream-sync`.
4. **Upstream preservation:** do not casually rewrite, delete, or refactor
   upstream code. Attribute failures to upstream, fork, or interaction before
   changing them.
5. **Build closure:** adding, moving, or renaming source must keep Cargo/Bun/
   TypeScript/Vite/Docker/Nix/CI inputs and production artifacts complete.
   Specifically, when adding, removing, or renaming workspace crates, editing
   `Cargo.toml`/`Cargo.lock`, or altering production services/Nix lists, run
   `just hakari` (`cargo run -p xtask -- deps`) to regenerate
   `.github/workspace-dep-closures.json` and `workspace-hack`, and sync
   `self-host/scripts/affected-services.py`. Routine/small code edits (UI copy,
   bug fixes, internal module logic) do not touch dependency graph boundaries
   and must skip this heavy check.
6. **Validation by phase:** development uses targeted/lightweight checks;
   upstream sync, release, and production acceptance use the required full or
   production checks. Targeted checks never redefine the production artifact.
7. **Native paths first:** for runtime drift, use existing Just, xtask, Compose,
   IaC, migration, seed, and doctor/reconcile paths before adding workarounds.
8. **No unapproved external mutations:** do not push, open/merge PRs, deploy,
   or alter production unless the user explicitly asks.

## Fork machine gate

`just fork-gate` is the sole machine source for Hook, Override, Retirement,
Zero-cloud, Telemetry privacy, and customization-overlap checks. Other Skills
must require the gate when relevant, but must not copy its Ruby command list.

## Local and production boundaries

Use the local-environment Skill for local setup and the production reference for
production access. Do not infer a production host or expose credentials in a
Skill. Keep local data volumes by default; only an explicit reset may remove
data, with the two storage layers kept aligned.

## Completion

Report changed files, targeted/full/production checks actually run, and any
environment-blocked verification. Do not claim a check passed merely because a
related workflow exists.
