---
name: macro-pre-push-gate
description: Push and release gatekeeper for KevinLaucn/macro. Validates offline SQLx query cache parity, offline Nix/CI compile simulation, frontend type and lint contracts, and untracked artifacts before pushing to origin/main or triggering release builds.
---

# Macro Pre-push & Release Gate (推送与发布前契约对齐门禁)

## ⚡ 核心目标与防线定位

在向远端仓库推送（`git push origin main`）、提交 PR 或触发生产镜像构建前，**必须执行本门禁审查**。
彻底消灭以下三大类“本地看似正常、CI 跑十几分钟后暴雷”的致命断层隐患：
1. **SQLx 离线元数据断层**：修改了 SQL 语句但漏生成或漏提交 `.sqlx/query-*.json`，导致 CI 离线构建报 `SQLX_OFFLINE=true but there is no cached data for this query`；
2. **在线与离线推断漂移**：迎合本地 live DB 动态推断私加 `.unwrap_or_default()` 或破坏强类型，导致 CI 离线构建报 `E0599` / `E0308` 编译崩溃；
3. **未暂存孤儿元数据**：新生成的元数据或生成代码处于未追踪（Untracked，即绿色 `U`）状态被遗漏在本地，导致远端构建缺失依赖。

---

## 一、前置自动化审查四步法 (The 4-Step Pre-push Verification)

在准备推送前，按顺序依次执行以下四道拦截关卡：

### 关卡 1：Git 暂存区与未追踪文件扫描 (Untracked & Parity Check)
检查工作区状态，严防关键元数据文件被遗漏：
```bash
git status -s
```
- **红线拦截**：若发现 `.sqlx/` 目录下存在标红 `D`（已废弃）或标绿 `??`（新生成未追踪）的元数据，必须与当前代码改动一同执行 `git add .sqlx`，严禁只提交业务代码而留下元数据孤儿！
- **代码生成契约**：若触碰了 OpenAPI、GraphQL 或 protobuf 定义，检查关联的生成的客户端文件（如 `generated/` 目录）是否已完整暂存。

### 关卡 2：SQLx 离线元数据一致性验证 (SQL Offline Parity)
检查当前提交或工作区改动中是否触碰了任何 `.rs` 文件里的 SQL 查询（`sqlx::query`、`sqlx::query_as`、`sqlx::query_scalar`）：
1. **改动特征检测**：
   ```bash
   git diff HEAD --name-only | grep -E '\.rs$'
   ```
2. **离线缓存缺失预警**：
   若改动了 SQL 查询，且未重新运行提取，直接以离线模式验证目标 crate：
   ```bash
   SQLX_OFFLINE=true cargo check -p <crate_name>
   ```
   若输出中包含 `SQLX_OFFLINE=true but there is no cached data`，**立即阻断推送**！
3. **一键自动修复与缓存刷新**：
   确保本地 PostgreSQL 容器（`macro-postgres-1`，默认端口 5433）处于运行状态，执行工作区全量元数据提取：
   ```bash
   DATABASE_URL="postgres://user:password@localhost:5433/macrodb" cargo sqlx prepare --workspace -- --workspace --exclude sync_service --exclude call --all-features
   git add .sqlx
   ```

### 关卡 3：全真离线生产微服务编译模拟 (Production Offline Parity)
完全模拟 GitHub Actions 和 Nix 容器镜像构建的纯离线无数据库沙盒环境，对触碰到的生产自托管服务执行针对性验证：
```bash
# 针对核心邮件微服务：
SQLX_OFFLINE=true cargo check -p email
SQLX_OFFLINE=true cargo check -p email_service --no-default-features --features self-host-email

# 针对核心认证微服务：
SQLX_OFFLINE=true cargo check -p authentication_service --no-default-features --features self-host-email
```
- **验收标准**：必须退出状态码为 0，严禁出现任何 `E0599`（调用不存在的方法）或类型不匹配。

### 关卡 4：前端轻量静态检查与 CI 规范审查 (Web & Lint Parity)
若改动触碰了 `apps/web/` 或 `packages/` 前端代码：
1. **轻量类型守卫（严禁执行全量 build）**：
   ```bash
   cd apps/web && bun run tsc --noEmit
   ```
2. **CI 代码规范与 import 排序检测**：
   ```bash
   bun run lint:ci
   ```
- **验收标准**：0 个类型报错，Biome 规范无任何 warning 或 error。

---

## 二、智能自愈与阻断规则 (Guardrails & Auto-healing)

| 场景 | 检测特征 | 自动处理与阻断动作 |
|---|---|---|
| **改动了 SQL 但漏了 `.sqlx`** | `git diff` 触碰了 SQL 字符串，但 `.sqlx/` 无变更或报错缺少 query | **立即阻断推送**。自动调用本地 DB 执行 `cargo sqlx prepare` 生成元数据并提示主人合并暂存。 |
| **代码与离线元数据类型对不上** | 本地在线通过，但 `SQLX_OFFLINE=true` 报 `E0599` 或 `E0308` | **立即阻断推送**。提示主人移除业务代码处的旁路补丁（如不当的 `.unwrap_or_default()`），通过强断言 `AS "col!"` 或对齐上游解决。 |
| **存在未追踪的 `.sqlx` 文件** | `git status` 显示 `.sqlx/query-*.json` 处于 Untracked 状态 | 提示主人：“检测到待提交的离线查询元数据，必须合并暂存后再推送”。 |
| **前端类型或 Biome 格式错误** | `tsc --noEmit` 报类型错误或 Biome import 顺序不合规 | **立即阻断推送**。在 `apps/web` 下执行 `bunx --bun @biomejs/biome check --write` 自动整理格式后重新校验。 |

---

## 三、门禁通过与标准放行流程

只有在上述四道关卡**全部绿灯通过**后，才允许向主人报告并执行标准推送：
1. 执行 `codegraph sync /Volumes/开发/macro` 刷新本地知识图谱；
2. 执行 `git fetch origin main && git rebase origin/main` 保持提交历史线性；
3. 执行 `git push origin main`；
4. 监控 GitHub Actions 流水线，确认 `macro-services` 和 `macro-web` 顺利通过构建。
