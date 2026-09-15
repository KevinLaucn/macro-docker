---
name: upgrade-model
description: Upgrade a configured AI model across the repository without assuming slots, providers, registry shape, or context limits.
allowed-tools: Bash, Read, Edit, Grep, Glob
---

# Upgrade AI Model

Use the current model registry, provider configuration, generated contracts,
and workflow as the source of truth. Do not assume `fast`/`good`, a provider,
Anthropic, a fixed context window, or fixed file names.

## Workflow

1. Read the relevant `AGENTS.md`/`CLAUDE.md`, then locate the registry,
   provider mapping, defaults/fallbacks, service configuration, and frontend
   model representation with `rg` or CodeGraph. Record the current source and
   generated-file boundaries.
2. Confirm the requested model identifier and intended configuration entry only
   when the request leaves those materially ambiguous. Inspect provider support,
   capabilities, context limits, and fallback semantics from the registry or
   provider configuration; never infer them from a model name.
3. Update the authoritative source entries and any directly required mapping,
   default, or fallback. Keep generated artifacts generated rather than editing
   them by hand.
4. Regenerate API/model contracts using the repository's current command and
   update frontend usages reported by type checking. Do not invent a new model
   enum or UI slot if the current registry uses another structure.
5. Run targeted Rust/frontend checks for touched packages. Run the applicable
   generation `--check`, `just check`, and broader checks only when the changed
   contract or release scope requires them.

## Safety

Preserve provider, access, fallback, and context-window semantics unless the
user explicitly requests that behavior change. Do not hardcode credentials or
provider secrets. Report pre-existing failures separately from model-related
failures.

## Report

Report the registry/config files used as authority, source and generated files
changed, provider/capability evidence, checks run, and unresolved ambiguity.
