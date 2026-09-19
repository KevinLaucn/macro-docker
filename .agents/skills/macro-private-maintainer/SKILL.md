---
name: macro-private-maintainer
description: Master router for maintaining the long-lived private Macro fork. Use for fork-owned development, upstream drift review, self-host invariants, private hooks, and deciding whether a change belongs to upstream or the private fork.
---

# Macro Private Maintainer

Own fork policy here. Upstream Skills are read-only mirrors of macro-inc/macro and
must remain byte-identical to the selected upstream target.

## Routing

| Task | Skill |
| --- | --- |
| Rust domain/inbound/outbound work | `../cloud-storage-hexagonal-architecture/SKILL.md` |
| New or changed AI Tool | `../create-ai-tool/SKILL.md` |
| Local stack, Docker, ports, CI parity | `skills/macro-local-environment/SKILL.md` |
| UI/UX under apps/web | `skills/macro-ui-design/SKILL.md` |
| Upstream merge/drift/conflict review | `skills/macro-upstream-sync/SKILL.md` |
| Push, PR, release or build contract | `../macro-pre-push-gate/SKILL.md` |
| i18n extraction/audit | `references/i18n-workflow.md` |
| Production operations | `references/production-deployment.md` |

Read the relevant AGENTS.md/CLAUDE.md and repository source before editing.
Use CodeGraph when present; use rg for literal/config/PRIVATE-HOOK checks.

## Authority order

1. The selected upstream source is authoritative for upstream-owned behavior.
2. `packages/fork/<feature>/`, `.fork/`, and this private Skill hierarchy own
   fork policy and fork features.
3. An upstream-owned file may differ only for a registered minimal integration
   point, exact override, self-host boundary, or temporary blocker patch.
4. Generated artifacts never define intended behavior.

## Upstream bug policy

Do not locally repair, harden, refactor, or work around an upstream bug when
normal fork operation remains usable and no declared fork invariant is broken.
Preserve upstream behavior and take the official fix in a later sync.

A local upstream-owned bug fix is allowed only when it blocks normal operation
or violates an explicit self-host/privacy/fork requirement. Keep it minimal and
register all of:
- a unique PRIVATE-HOOK when source semantics are changed;
- a matching `.fork/customizations.yml` entry;
- a targeted regression test;
- a `.fork/retirements.yml` condition when upstream can absorb the behavior.

## Fork boundary

- Put complete fork features in `packages/fork/<feature>/`.
- Keep upstream-owned integration code as small hooks, adapters, registrations,
  imports, or router entries.
- Put deterministic exact replacements in `.fork/overrides/`.
- Never use a generic CORE-ADAPTATION label as permission for unexplained
  upstream-owned source drift.
- Never edit an upstream-provided `.agents/skills/**` file. Extend behavior
  through this private Skill hierarchy instead.

## Cross-task invariants

1. Zero Macro cloud: no implicit `*.macro.com` fallback for private user data.
2. Preserve credentials and local data; destructive reset requires explicit intent.
3. Preserve upstream capabilities unless an explicit fork customization replaces
   or gates them.
4. Attribute failures to upstream, fork, or interaction before editing code.
5. Keep Cargo/Bun/TypeScript/Vite/Docker/Nix/CI closure complete when boundaries
   change; run Hakari only when dependency/workspace topology changes.
6. Development uses targeted checks; sync/release uses the required full gates.
7. Prefer native Just/xtask/Compose/migration/reconcile paths over workarounds.
8. Push/PR/merge/deploy only with explicit user intent.

## Machine governance

`just fork-gate` is the sole machine entrypoint. It must validate hooks,
overrides, retirements, privacy/zero-cloud constraints, upstream overlap, and
unexplained core drift. Do not duplicate its command list in other Skills.

A sync is not complete while an upstream-owned diff lacks an explicit owner and
classification. For every remaining diff, be able to answer: why it differs,
which customization owns it, which test protects it, and when it can be removed.

## Completion

Report changed files, upstream target SHA, remaining classified drift, checks
actually run, and blocked environment-dependent verification.