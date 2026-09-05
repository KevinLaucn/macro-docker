---
name: macro-local-environment
description: Local development, macOS Docker runtime, local stack, headless stack, local production validation, and CI parity workflow for KevinLaucn/macro.
---

# Macro Local Environment

Use this skill for any task involving local development, macOS Docker runtime, local stack startup, `run_local`, `run_dev`, `doctor-local`, `status_local`, `stack`, local service image builds, port conflicts, or local production/CI parity checks.

## First Step

Classify the request before running commands:

- `DEV`: attached local developer stack with Vite dev server.
- `DEV_HEADLESS`: detached local stack for agents/CI-style operation.
- `DEV_SHARED`: local binaries pointed at shared dev resources.
- `PROD_LOCAL`: local validation of production-style artifacts.
- `CI_PARITY`: local reproduction of CI or release build behavior.
- `DEBUG_EXISTING_LOCAL`: inspect or repair an already running local stack.

Before acting, state:

- `LOCAL MODE`
- `HOST`
- `TARGET`
- `BUILD PATH`
- `RUNTIME PATH`

Use `git rev-parse --show-toplevel` for the repository root. Do not hard-code a personal absolute checkout path.

## Canonical DEV Commands (Default: Frontend HMR Hot Reload)

From the repository root:

```bash
# 启动完整本地后端基础设施与服务，同时以热更新模式运行前端 (Vite HMR，端口 3000)
just run_local --no-doppler

# 或在已有本地后端服务运行时，单独启动前端热更新服务：
just frontend
```

> **默认热更新说明**：
> - 本地日常前端开发**默认使用热更新开发模式**（`just run_local` 或 `just frontend`），访问 `http://localhost:3000/app`。
> - 本地开发私有变量的权威文件是仓库根目录 `.env.local`；`xtask_local` 默认读取它。不要把本地开发凭据写到 `local.env`、`.env`、compose 文件或 shell 历史里。
> - 在热更新模式下，任何在 `apps/web/src` 下修改的代码将由 Vite 实时编译热替换（HMR），无需手动重新 build。
> - 如需使用 Rustup toolchain 编译前端中的 agent-fold 等 Wasm 依赖，请确保 PATH 包含 `$HOME/.cargo/bin`。

For an isolated instance or a port-conflict workaround:

```bash
just doctor-local --instance <name> --port-base <free-port>
just run_local --no-doppler --instance <name> --port-base <free-port>
just status_local --instance <name> --port-base <free-port>
```

The explicit port base `31000` is a useful example only; it is not a project default.

## Canonical Headless Commands (Static Bundle via Proxy)

Use `just stack` ONLY when the caller needs the stack to return control after startup (e.g. CI/agent automated testing), with no attached hotkey loop and serving a pre-built static frontend bundle through the Caddy proxy (`http://localhost:8090/app`):

```bash
just stack up --no-doppler --no-build
just stack status --json
just stack update --no-doppler
just stack down
```

> **注意**：`just stack` 属于静态 Bundle 代理模式，修改源码后必须执行 `just stack update --frontend` 才会重新编译打包；日常开发请优先使用上面的 `just run_local` 或 `just frontend` 热更新模式。
>
> **端口判定**：如果 `http://localhost:8090/app` 可访问但 `http://localhost:3000/app` 不可访问，当前只运行了 headless/static proxy stack，没有 Vite HMR 前端。需要热更新时，保持后端容器不动，另开终端运行 `just frontend`；或用 `just stack down` 停止容器后改用 `just run_local --no-doppler`。
>
> **构建前必查**：任何本地栈构建、`stack up`、`stack update`、agent harness、runtime image 或 `--no-build` 相关操作，先读：
> - `tooling/xtask/crates/xtask_local/src/local/sandbox_image.rs`
> - `tooling/xtask/crates/xtask_local/src/local.rs` 的 `prepare(...)`
> - `tooling/xtask/crates/xtask_local/src/local/stack.rs` 的 `up(...)` / `update(...)`
>
> 默认不要重建 agent harness sandbox image。已存在 `macro-agent-harness:latest` 且本次任务不是修改 `crates/agent_harness/container/`、sandbox flake/runtime 输入或 `/app/out` 挂载二进制时，使用 `--no-build`。这能避免 Docker BuildKit 卡在 `crates/agent_harness/container/Dockerfile.local`。

## 数据持久化与安全停止准则 (Preserving Local Data & Email Links)

> ⚠️ **数据防丢核心守则**：
> 本分叉的本地开发命令不得默认清空 Docker 数据卷。`run_local`、`stop_local`、`destroy_local` 与无参 `just stack down` 都必须保留 `macro_postgres_data`、`macro_redis_data`、`macro_opensearch_data`、`macro_kafka_data`、`fusionauth_db_data`、`fusionauth_config` 等本地数据卷。
>
> **严禁误用重置/种子命令**：排查真实本地账号、团队、CRM、Gmail、邮件或联系人问题时，不得运行 `just reset_local`、`just local-e2e-seed`、`cargo run -p seed_cli -- scenario local-e2e-smoke`、`just setup_local_dbs`、`just initialize_dbs`、`sqlx database drop`、`drop_db` 或任何会重置 MacroDB/FusionAuth/LocalStack 数据的命令，除非用户明确要求“清空/重置数据库”。`macro|e2e@macro.local`、`bob@example.com`、`charlie@example.com` 等是 E2E fixture 用户，不是真实开发账号；不要用它们验证用户的真实 CRM 问题。

**彻底重置本地开发环境（安全重置与用户自愈准则）**：
1. **双层存储必须保持对齐**：
   - Macro 的用户认证层驻留在 `FusionAuth`（账号凭据/OAuth），业务实体层驻留在 PostgreSQL `macrodb`（`User`、`macro_user`、团队、CRM）。
   - 若用户明确要求“彻底重置本地开发环境/清空数据库”，**必须同步重置 FusionAuth 的持久化数据卷（`fusionauth_db_data`、`fusionauth_config`）**；
   - 若仅重置了 `macrodb`，必须立即向 `authentication-service`（`/webhooks/user`）触发已存在活跃账号的内部 `user.create` Webhook，将当前管理员账号档案补全至 `User` 与 `macro_user` 表，防止无密码登录老用户因无法触发新用户 Hook 而沦为“幽灵用户”（引发创建团队 500、绑定 Gmail 500 等外键缺失异常）。

**保留本地邮箱与全部数据的标准操作**：
1. **停止本地服务（保留数据）**：
   ```bash
   just stack down
   ```
   该命令只会停止并移除 Docker 容器/临时网络，严格保留所有数据库持久化数据卷。
2. **再次恢复启动（复用数据）**：
   ```bash
   just stack update
   ```
   采用最新编译构建更新容器，本地数据库、已绑定的邮箱账户与邮件数据 100% 完整留存。

## Google / Gmail 认证链路回归测试规范 (Google OAuth Regression Check)

为避免环境重置或更新后出现 Google/Gmail 绑定报 500 或 IdP 丢失，提供以下自动化回归检查流程：
1. **凭证完整性**：确认根目录 `.env.local` 存在且包含合法的 `GOOGLE_CLIENT_ID` 与 `GOOGLE_CLIENT_SECRET_KEY=GOCSPX-...`。
2. **IdP 注册状态**：调用 FusionAuth Admin API 确认已注册 `google_gmail` 身份提供商。
3. **服务容器状态**：确认 `macro-authentication-service-1` 容器内注入的不是占位符 `local-google-client`。
4. **用户角色权限**：确认当前测试用户拥有 `professional_subscriber` 权限角色。

日常可通过一行回归验证脚本快速执行全套检测：
`bash -c 'test -f .env.local && grep -q "^GOOGLE_CLIENT_SECRET_KEY=GOCSPX-" .env.local && curl -sf http://localhost:9011/api/identity-provider -H "Authorization: bf69486b-4733-4954-a44e-2e1b5f2c8a91" | grep -q "google_gmail" && echo "✓ Google 认证链路回归校验全部通过"'`



## Mandatory Rules

- Preserve the upstream local workflow unless the task explicitly asks to change it.
- Do not create a second local infrastructure stack when `xtask_local` already owns the workflow.
- Root `.env.local` is the default local developer env file. Prefer it over `local.env`; keep production `.env` separate.
- Do not kill unrelated host processes for port conflicts by default; prefer `--instance` and `--port-base`.
- Use the same `--instance` and `--port-base` for run, seed, status, stop, reset, and destroy commands.
- Never run destructive local seed/reset commands while debugging a user's real local data unless the user explicitly requests a database reset.
- Never use production secrets for normal DEV.
- Do not treat local DEV success as production or CI parity.
- Use CodeGraph for symbol/call relationship analysis when `.codegraph/` exists.
- Use Cargo/Nix/Compose graphs for build dependency analysis instead of guessing from filenames.

## References

Read only what applies:

- `references/macos.md`: macOS host/runtime model and local startup expectations.
- `references/commands.md`: command map and when to use each one.
- `references/troubleshooting.md`: stuck image pulls, port conflicts, stale images, and status checks.
- `references/production-parity.md`: DEV vs production/CI parity boundaries.
