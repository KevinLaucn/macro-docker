---
name: qc
description: Proportional quality review for code, configuration, and release changes.
allowed-tools: Task, Bash, Read, Grep, Glob
---

# QC Gate

Use QC when the user asks for it, the change is release-facing, or risk is
unclear. Match review depth to risk:

- small docs, Skill, or isolated low-risk change: one focused review;
- normal code/config change: two or three independent reviews covering
  correctness, consistency, and scope;
- security-sensitive, cross-service, or release-critical change: up to five
  reviews in parallel.

Do not require five agents for every small change. Do not impose an abstraction
rule based on a line count; introduce shared code only when it removes real
duplication or clarifies a stable boundary.

## Review contract

Start with the actual diff against the relevant base and read nearby unchanged
files for context. Each reviewer returns structured findings with severity,
file/line, evidence, and a concrete repair. Reviewers should check:

- correctness and failure handling;
- consistency with repository patterns and manifests;
- security, privacy, permissions, and data behavior;
- scope, regression risk, and unnecessary complexity.

Aggregate findings, remove duplicates, and distinguish actionable defects from
pre-existing or informational observations. A change is ready only when all
blocking findings are resolved or explicitly accepted by the user. QC does not
replace `just fork-gate`, targeted tests, or the release/build gate.

## Report

Report the review depth, blocking findings, resolved findings, and checks run.
