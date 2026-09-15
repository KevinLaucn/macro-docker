---
name: debug-service
description: Debug local Rust services in this repository by starting the crate's binary with debug logging, tailing service logs, and using those logs to answer runtime questions. Use when Codex needs to investigate service startup, runtime behavior, errors, or logs for a Rust binary in a crate.
---

# Debug Service

First determine whether the complete local stack is already running. If it is,
use `../live-debug/SKILL.md` for traces, logs, and browser reproduction instead
of starting a second service. Use this Skill for a standalone Rust binary or
when the relevant service is not available in the local stack.

Start the binary with debug logging only after checking the existing stack and
the crate's `justfile`:

RUST_LOG=<name_of_bin>=debug,info
  just run > /tmp/<name_of_bin>.log 2>&1 & tail -f /tmp/<name_of_bin>.log

Use the log tail to answer questions as appropriate
