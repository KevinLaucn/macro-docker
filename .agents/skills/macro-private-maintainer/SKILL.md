---
name: macro-private-maintainer
description: Master orchestration skill for maintaining, auditing, developing, and deploying KevinLaucn/macro. Enforces zero Macro cloud dependency, upstream compatibility, private VPS/Docker deployment, Gmail API architecture, and coordinates repo-local skills.
---

# Macro Private Maintainer (总控 / Router / Policy Entry)

## ⚡ 核心准则：代码关系链与 Bug 定位优先使用 CodeGraph 索引

> ⚠️ **最高优先级执行铁律**：本项目已全量构建 Tree-sitter 语法树级别的本地代码知识图谱（`.codegraph/`，绝对路径 `/Volumes/开发/macro/.codegraph`，包含 1.1 万文件、15.6 万节点、51.5 万依赖边）。
>
> **无论何时遇到排查 Bug、报错定位、调用链与被调用关系（Callers / Callees）、跨 crate 依赖流与修改影响面（Impact），还是前端 i18n 快速定位组件，必须优先使用 CodeGraph CLI 秒级直达目标文件，严禁盲目大范围递归 grep！**
>
> 常用秒级定位命令速查：
> - **排查 Bug / 符号调用源头（谁调用的）**：`codegraph callers <symbol>`
> - **排查函数依赖下游（调用了谁）**：`codegraph callees <symbol>`
> - **排查修改影响面与关联单测**：`codegraph impact <symbol>`
> - **领域/模块全景探查**：`codegraph explore "<query>"`
> - **查看符号定义与实现**：`codegraph node <symbol_or_path>`
> - **增量同步索引**：修改代码或重构后，执行 `codegraph sync /Volumes/开发/macro`。

---

## 一、Skill 定位与核心职责

这是专门用于维护、审查、二开和部署 `KevinLaucn/macro`（Macro 官方开源项目的长期私有分叉）的总控编排 Control Plane。

### 核心设计哲学
> **Master Skill 是 Control Plane，不是所有领域知识的 Knowledge Dump。**  
> 负责硬性约束（Hard Invariants）、意图路由（Intent Dispatcher）、代码关系链精准导航（CodeGraph 优先）、全局安全门禁与统一响应规范。具体业务与垂直领域知识按需下沉到子技能或 `references/` 文档中渐进式加载（Progressive Loading）。

### 核心守护目标
1. **保持 upstream 兼容**：最低化 Fork Divergence，支持平滑 `git merge upstream/main`；
2. **私有化零官方云依赖**：`Zero Macro Cloud Dependency`，切断一切无感知 `macro.com` fallback；
3. **保护四大核心支柱**：**Email**（Gmail 同步/写信）、**Contacts**（联系人）、**CRM**（客户时间线）、**Search**（检索）；
4. **保留上游源码，解除生产依赖**：`Preserve upstream source; remove production dependency.`；
5. **Profile 驱动可达性隔离**：目标 Domain 源码可以继续保留，但在指定 Product Profile 下必须不可进入编译闭包、生产制品、Docker 镜像与运行时图；
6. **本地开发默认热更新原则**：本地日常界面二开与联调默认采用**热更新开发模式**（`just run_local` 或 `just frontend`，端口 `3000`），避免使用静态产物挂载模式导致源码修改不生效；`just stack` 仅限 CI/自动化或发布验收使用；
7. **本地数据持久化与防丢原则**：本分叉的本地开发命令不得默认删除 Docker 数据卷。`run_local`、`stop_local`、`destroy_local` 与无参 `just stack down` 都必须保留本地数据库、Redis、OpenSearch、Kafka 与 FusionAuth 数据卷；只有显式数据库重置命令可清空对应数据。
8. **认证中心（FusionAuth）与业务库（MacroDB）一致性守则**：FusionAuth 与 MacroDB 为双层独立存储。若显式执行“清空/彻底重置数据库”，必须保持两者对齐（同步重置 FusionAuth 存储卷，或在重置 MacroDB 后立即自动补齐 FusionAuth 已有活跃账号的 `User` / `macro_user` 档案与权限），严禁只重置业务库而留下孤儿身份，导致无密码老用户因未触发 `user.create` 陷入建团队/绑邮箱 500 异常。

---


## 二、意图自动分发与路由表 (Intent Dispatcher)

作为主入口，在接收到任何关于 `KevinLaucn/macro` 的开发运维任务时，**必须首先查阅此表执行第一级精准路由**：

| 用户意图 / 任务类型 | 触发特征 / 关键词 | 优先分发路由 (Target Sub-Skill / Spec) |
|---|---|---|
| **✂️ 功能裁剪 / 依赖瘦身 / Change Planner** | “删功能”、“裁剪”、“不要某服务”、“减镜像”、“Email不需要”、“能不能删”、“瘦身”、“Change Planner”、“slim-plan” | **`skills/macro-upstream-decoupling/SKILL.md`**（Profile-driven Reachability Isolation、Change Planner 边际削减、cargo x slim-plan、五层可达性验收、两阶段物理删除门禁、Decoupling Report） |
| **🏗️ Rust 后端架构 / 微服务二开** | `crates/**`、`services/**`、Hexagonal 架构、Domain 改造、Ports & Adapters、S3/DB 适配器 | **`../cloud-storage-hexagonal-architecture/SKILL.md`** |
| **🧰 本地开发 / macOS / Docker / Local Stack** | macOS、Docker Desktop、OrbStack、Colima、`run_local`、`run_dev`、`doctor-local`、`status_local`、`stack up`、本地构建、端口冲突、Production Parity、本地复现 CI | **`skills/macro-local-environment/SKILL.md`** |
| **🔍 运行时调试 / Crash 排查** | 容器退出、服务启动失败、500 报错、Connection Refused、端口无响应 | **`../debug-service/SKILL.md`** |
| **📊 数据库 Schema / 迁移** | Migration、PostgreSQL 表字段、Email/Gmail 数据表、Dump | **`../dump-schema/SKILL.md`** |
| **🛡️ 发布前质检 / 审查门禁** | PR 审查、发布前验证、QC、精简度评估、稳定性检查 | **`../qc/SKILL.md`** |
| **📦 依赖治理 / 漏洞升级** | Dependabot、Cargo/Bun/NPM 依赖冲突、CVE 修复 | **`../dependabot/skill.md`** |
| **🌐 i18n 国际化 / 显式化二开** | 多语言、i18n、翻译、显式 t()、excludePatterns、audit、词条提取 | **`references/i18n-workflow.md`**（**优先通过 CodeGraph 快速定位组件**，索引缺失时执行 `codegraph sync`） |
| **🤖 AI 工具与模型扩展** | AI Tool 开发、Agent 工具注入、模型升级切换 | **`../create-ai-tool/SKILL.md`** / **`../upgrade-model/SKILL.md`** |
| **🚀 VPS 生产运维 / 部署** | 部署、SSH、Docker Compose、生产更新、运维排障 | **`references/production-deployment.md`**（凭据见 `.local-production.md`） |

### 子技能路由调度准则
当分发到上述子技能时：
1. **修改代码前必读**：首先读取目标子技能 `SKILL.md` 或引用文档；
2. **遵循领域约束**：严格遵守对应子技能的领域特定规则；
3. **回归主控验收**：执行完毕后，返回本主控技能的全局安全性与验收门禁核验。
4. **本地环境强制路由**：任何本地开发、本地栈、macOS Docker、`run_local`、`stack`、本地生产验证或 CI parity 任务，必须先进入 `skills/macro-local-environment/SKILL.md` 再执行环境相关命令。

---

## 三、硬性全局约束 (Hard Invariants)

1. **证据先于假设**：禁止仅凭模型记忆猜测 Macro 实现，必须以当前 Git 状态、真实代码、运行时日志、官方文档为真凭实据。
2. **零官方云外发**：禁止向 `*.macro.com` 外发用户敏感数据，禁止将本地请求失败隐式自动 fallback 到官方云。
3. **禁止无意义删除**：严禁仅因功能不用就大面积删除 upstream 源码。必须先判定能否通过解耦实现。
4. **修改优先级原则**：配置 > 环境变量 > Adapter 替换 > 依赖注入 > 反代 Proxy > 小范围 Patch > 修改 Domain。
5. **凭据安全红线**：严禁在 Git 追踪的文件中硬编码真实服务器 IP、私钥、OAuth Secret 或 API Key。

---

## 四、代码关系链与构建闭包穿透准则 (Cargo Tree 与 CodeGraph AST 双轨制)

解耦重构与依赖排查必须严格遵循「Cargo 特性闭包」与「AST 语法树调用」双轨定位机制，严禁盲目递归 grep：

1. **Cargo 特性依赖图与闭包穿透（谁把依赖拉进来的）**：
   - **反查是谁引入了目标依赖**：`cargo tree -p <service> -i <target_crate> [--no-default-features]`（0.1 秒秒级输出精准的反向依赖树，直接透视如 `rdkafka`、`call`、`ai_toolset` 是经由哪几条链条引入的，无需翻阅任何代码文件）。
   - **透视是哪个 Feature Flag 激活的**：`cargo tree -p <service> -e features -i <target_crate>`（精准定位是哪个可选 feature 级联打开了重依赖）。

2. **AST 符号调用链与影响面全景（代码里的函数/结构体谁调用的）**：
   - 本地已全量构建 Tree-sitter 图谱（`.codegraph/`，绝对路径 `/Volumes/开发/macro/.codegraph`，1.1 万文件、15.6 万节点、51.5 万依赖边）。
   - **领域全景探查（Explore）**：`codegraph explore <query>`（一站式聚合输出领域相关符号、源码片段与调用图，如 `codegraph explore "email_service"`）。
   - **影响面深度分析（Impact）**：`codegraph impact <symbol>`（秒级分析修改指定符号波及的所有上游依赖链与测试用例）。
   - **查找调用方（Callers）**：`codegraph callers <symbol>`（秒级列出所有调用指定函数/结构体的代码位置）。
   - **查找被调用方（Callees）**：`codegraph callees <symbol>`（秒级获取指定方法内部调用的下游符号清单）。
   - **单节点全貌与溯源（Node）**：`codegraph node <symbol_or_path>`（输出符号源码、上下文及依赖路径）。

3. **图谱维护准则**：
   - **增量同步（Sync）**：编辑代码或重构 crate 后，主动执行 `codegraph sync /Volumes/开发/macro` 刷新索引。
   - **全量重建（Re-index）**：合并上游主干或拓扑巨变时执行 `codegraph index /Volumes/开发/macro`。
   - **引擎升级（Upgrade）**：执行 `codegraph upgrade` 更新至官方最新引擎。

---

## 五、按需知识库索引 (Progressive Loading References)

涉及具体垂直领域的深度实现细节时，按需直接读取 `references/` 目录：

- **Gmail 架构与 OAuth 同步**：读取 [`references/gmail-self-host.md`](file:///Volumes/开发/macro/.agents/skills/macro-private-maintainer/references/gmail-self-host.md)
- **i18n 国际化与显式二开标准**：读取 [`references/i18n-workflow.md`](file:///Volumes/开发/macro/.agents/skills/macro-private-maintainer/references/i18n-workflow.md)
- **存储与附件生命周期策略**：读取 [`references/storage-attachments.md`](file:///Volumes/开发/macro/.agents/skills/macro-private-maintainer/references/storage-attachments.md)
- **WebSocket 与实时通信网关**：读取 [`references/realtime.md`](file:///Volumes/开发/macro/.agents/skills/macro-private-maintainer/references/realtime.md)
- **网络白名单与隐私审计规约**：读取 [`references/privacy-network.md`](file:///Volumes/开发/macro/.agents/skills/macro-private-maintainer/references/privacy-network.md)
- **生产环境部署与运维架构**：读取 [`references/production-deployment.md`](file:///Volumes/开发/macro/.agents/skills/macro-private-maintainer/references/production-deployment.md)
- **真实生产环境 SSH 连接凭据 (Local Only)**：读取 [`.local-production.md`](file:///Volumes/开发/macro/.agents/skills/macro-private-maintainer/.local-production.md)（已受 `.gitignore` 保护）

---

## 六、辅助目录管理策略

1. **`.sqlx/`（必须保留）**：离线查询元数据，修改 SQL 后必须在根目录执行 `nix develop --command just prepare_db` 更新。严禁手动编辑。
2. **`.claude/`（保留）**：Claude 开发规范资产，不作为业务运行时删除。
3. **`.cursor/`（可清理）**：Cursor Cloud 开发辅助环境配置，自托管与生产部署不依赖。

---

## 七、验收门禁与标准输出契约

### 1. 按波及范围的验收基线
- **Rust 后端**：`cargo fmt --check`、`cargo check -p <crate>`、`cargo clippy -p <crate>`、`cargo test -p <crate>`
- **前端 Web**：`bun format --check`、`bun check`、生产打包构建验证
- **生产配置**：`docker compose config` 核验服务拓扑与网络边界
- **网络边界**：核验 DevTools Network 与服务端日志中 `macro.com` 请求数为 0

### 2. 推送 GitHub 远端门禁 (Pre-push CI & Lint Gate)
在向 GitHub 远端仓库（`main` 或 PR 分支）提交与推送代码前，**必须在本地预先执行并通过以下规范检查**，以确保 GitHub Actions CI 100% 绿灯且不泄露任何外部依赖：
1. **统一本地质检门禁**：
   - 执行 `just check`：快速执行 `rustfmt`、`biome`（前端格式与语法校验）、`oxlint` 以及 `ast-grep` 语法树规则扫描。
   - 若改动涉及核心类型定义，执行 `just check full`（增加 `tsc` 与 `clippy` 全量分析）。
2. **私有化与零外部云防御检查**：
   - 确保没有引入写死的官方外部域名（如 `*.workers.dev`、`api.pipedream.com`、`macro-prox.*`、`*.posthog.com`、商业付费墙）。
   - 保持前置路由与 Onboarding 中第三方未配置连接器处于解耦/旁路状态。
3. **CI 对齐验证（GitHub Actions Parity）**：
   - 本项目 GitHub Actions CI 采用与本地一致的 `biome ci` 和 `ast-grep scan` 验证；本地 `just check` 通过即代表 CI 规范检查可完全通过。

### 3. 标准响应结构
每次任务完成时必须遵循：
1. 🔹方案概述（简短说明修改策略与架构归属）
2. 🔹已修改的文件路径（绝对路径清单，不含代码块）
3. 🔹测试方法（具体验证命令与操作步骤）
4. 🔹可选优化（仅在具有高实际价值时提供，严禁低收益过度优化）
