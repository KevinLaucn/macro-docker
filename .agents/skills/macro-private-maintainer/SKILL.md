---
name: macro-private-maintainer
description: Master router for maintaining the long-lived private Macro fork. Use for fork-owned development, upstream drift review, self-host invariants, private hooks, and deciding whether a change belongs to upstream or the private fork.
---

# Macro Private Maintainer

Own Fork policy here. Every Skill directory supplied by `macro-inc/macro` is a
read-only mirror and must remain fully byte-identical to the selected upstream
target. Put Fork instructions only in Fork-owned Skills.

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

Read relevant AGENTS.md/CLAUDE.md and source before editing. Use CodeGraph when
present and `rg` for literals, config, URLs, and PRIVATE-HOOK markers.

## Authority order

1. Upstream-owned behavior follows the selected upstream source by default.
2. `packages/fork/<feature>/`, `.fork/`, and Fork-owned Skills define private behavior.
3. `customizations.yml.paths` is only watch/test scope.
4. `customizations.yml.owned_paths` is the exact file-level grant for upstream
   source drift; never use a broad glob as drift permission.
5. `.fork/upstream.yml` records the last upstream SHA actually merged into main.
6. `remaining-core-diffs.yml` is a derived snapshot, never a historical allowlist.

## Upstream bug policy

Do not repair, harden, refactor, or work around a non-blocking upstream bug when
normal Fork operation remains usable and no declared Fork invariant is broken.
Preserve upstream behavior and take the official fix in a later sync.

A blocker-only upstream patch must be minimal and have an explicit customization,
exact `owned_path`, PRIVATE-HOOK when semantics are injected, targeted regression
test, and retirement condition when upstream can absorb it.

## Fork boundary

- Put complete Fork features in `packages/fork/<feature>/`.
- Keep upstream integration to minimal hooks/adapters/registrations.
- Never delete or relocate an upstream file merely to accommodate a Fork feature.
- Put deterministic exact replacements in `.fork/overrides/`.
- Every PRIVATE-HOOK declares exactly one semantic `customization` owner.
- Never use generic CORE-ADAPTATION wording to justify source drift.
- Never edit an upstream-provided Skill; extend behavior through Fork-owned Skills.

## Invariants

1. Zero Macro cloud fallback for private user data.
2. Preserve credentials and local data; destructive reset requires explicit intent.
3. Preserve upstream capabilities unless a registered Fork requirement changes them.
4. Attribute failures to upstream, Fork, or interaction before editing.
5. Keep build/dependency closure complete when topology changes.
6. Use targeted checks in development; sync/release uses strict gates.
7. Prefer native Just/xtask/Compose/migration/reconcile paths over workarounds.
8. Push/PR/merge/deploy only with explicit user intent.

## Core Maintainer Hard Rule

> **"No diff in fork-owned files does not mean the customization is preserved."**
> Every fork customization must monitor and verify its upstream dependencies, API schemas, data flow, callers, and runtime configuration. When upstream refactors or modifies an integration seam, the customization must be verified and adapted end-to-end, rather than solely checking whether PRIVATE-HOOK markers exist.

### Dependency Surface Hard Rule
对 `risk=high` 的 customization，不允许只保护 fork-owned 文件和 PRIVATE-HOOK。`customizations.yml.paths` 必须覆盖其上游运行时依赖链，包括调用者、被调用者、renderer/serializer/schema/router/adapters。上游修改任意依赖节点时必须触发对应 contract test。

### Side-effect Negative Contract Rule
对 tracking、webhook、notification、upload、auth 等有外部副作用的二开，必须同时验证“应该发生”和“绝不能发生”的行为。
对 read receipts 就是：
- **必须发生**：收件人请求 pixel → open。
- **绝不能发生**：发送者查看 Sent → open；回复/转发加载历史正文 → open；Macro 自己渲染邮件 → open。

## Two-Gate Verification Contract

Upstream sync and pre-push validation must enforce two complementary gates:

1. **Fork Contract Gate**: Guarantees that private fork customizations are not silently or indirectly broken by upstream changes.
   - **Canonical Case (Gmail Avatar)**:
     `Google Contact → Backend photo field → API schema → Frontend mapper → EmailUserTooltip → UserIcon`
     Even if `UserIcon.tsx` has 0 diff, when upstream changes field naming (`photo_url` vs `photoUrl`), serialization, or mapper signatures, the seam must be adapted to preserve avatar display.
2. **Self-host Smoke Gate**: Guarantees that upstream official core capabilities continue to function properly under the self-hosted infrastructure and environment.
   - **Canonical Case (Paste Screenshot)**:
     `Paste → Static File upload → Presigned URL → Object storage (LocalStack/S3) → Public access`
     Does not use PRIVATE-HOOK, but sync must smoke-test this pipeline to prevent broken host endpoints (such as `http://localhost:4566/... ERR_CONNECTION_REFUSED`).

## Upstream Capability Surface Diff

Whenever upstream merges, run a capability and routing surface diff before testing:
1. **Route & Service Parity**: Diff `tooling/xtask/crates/xtask_local/src/local/proxy.rs` and `inventory.rs` against `self-host/Caddyfile` and `self-host/docker-compose.yml`. Ensure all special routes (`/sync`, `/websocket`, `/i`, `/lexical`, `/ai-editing`, `/static-file`) are declared and mapped correctly.
2. **Capability Gating vs Fake 200s**: If upstream adds new features or services (e.g., `codex`, `agent-harness`, `calendar_service`) that are not deployed in the default self-host Email topology, gate them off via `AppCapabilities` and `env-config.js` (`codex: false`, `agents: false`). Never mock endpoints with fake `respond "[]" 200` in Caddy.
3. **Origin & WebSocket Contracts**: Upstream Cloudflare Worker / sync services validate `ALLOWED_ORIGINS`. Verify Caddy `@sync` rewrites `header_up Origin http://localhost:3000` to prevent 403 Forbidden handshake failures while adhering to zero-cloud invariants.
4. **Cache & Assets Invariants**: Verify `env-config.js` and HTML entrypoints carry `Cache-Control: no-cache, no-store, must-revalidate` to prevent stale chunk 404s after updates.
5. **Gate Execution**: Run `just fork-gate` (enforcing `check-drift.py` and `verify-release.py`).

## Machine governance

`just fork-gate` is the only machine entrypoint. Normal development defaults to
the SHA in `.fork/upstream.yml`; sync CI overrides it with live
`upstream/main` and requires ancestry.

A change is incomplete while an upstream-owned diff lacks an exact owner, a Hook
has no explicit semantic owner, an official Skill differs anywhere in its
directory, an upstream file was deleted, or the v2 drift snapshot is stale.

## Completion

Report upstream target SHA, changed customization ownership, remaining classified
core drift, checks actually run, and blocked environment-dependent verification.
