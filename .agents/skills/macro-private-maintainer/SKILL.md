---
name: macro-private-maintainer
description: Master orchestration skill for maintaining, auditing, developing, and deploying KevinLaucn/macro. Enforces zero Macro cloud dependency, upstream compatibility, private Tencent Cloud SG production deployment, Gmail API architecture, and coordinates repo-local skills.
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
5. **全量构建原则**：后端服务与 `apps/web` 默认全量构建、全量进入验证范围；生产目标是完整自托管 Macro，而不是服务级最小集合；
6. **客户端排除边界**：构建与发布默认只排除桌面客户端、移动端客户端等非 Web 客户端；`apps/web` 必须全量构建，不按页面、功能或业务域拆分构建；
7. **本地开发默认热更新原则**：本地日常界面二开与联调默认采用**热更新开发模式**（`just run_local` 或 `just frontend`，端口 `3000`），避免使用静态产物挂载模式导致源码修改不生效；`just stack` 仅限 CI/自动化或发布验收使用；
8. **本地数据持久化与防丢原则**：本分叉的本地开发命令不得默认删除 Docker 数据卷。`run_local`、`stop_local`、`destroy_local` 与无参 `just stack down` 都必须保留本地数据库、Redis、OpenSearch、Kafka 与 FusionAuth 数据卷；只有显式数据库重置命令可清空对应数据。
9. **认证中心（FusionAuth）与业务库（MacroDB）一致性守则**：FusionAuth 与 MacroDB 为双层独立存储。若显式执行“清空/彻底重置数据库”，必须保持两者对齐（同步重置 FusionAuth 存储卷，或在重置 MacroDB 后立即自动补齐 FusionAuth 已有活跃账号的 `User` / `macro_user` 档案与权限），严禁只重置业务库而留下孤儿身份，导致无密码老用户因未触发 `user.create` 陷入建团队/绑邮箱 500 异常。
10. **生产环境默认入口**：当前 Macro 生产环境运行在腾讯云 SG 2H8G 主机，SSH 别名为 `marc-sg-2h8g`，生产主路径为 `/home/ubuntu/marco/`。凡用户说“生产环境”“线上”“部署”“生产 Docker Compose”“生产日志/容器”且未指定其它主机时，必须主动连接 `marc-sg-2h8g` 并在 `/home/ubuntu/marco/` 下操作。飞牛 OS 与美国 VPS 均视为历史/备用环境；除非用户明确指定 `fnOS`、飞牛、美国 VPS、`tencent-us2h8g` 或旧 VPS，不要主动连接或排查。

---


## 二、意图自动分发与路由表 (Intent Dispatcher)

作为主入口，在接收到任何关于 `KevinLaucn/macro` 的开发运维任务时，**必须首先查阅此表执行第一级精准路由**：

| 用户意图 / 任务类型 | 触发特征 / 关键词 | 优先分发路由 (Target Sub-Skill / Spec) |
|---|---|---|
| **🏗️ Rust 后端架构 / 微服务二开** | `crates/**`、`services/**`、Hexagonal 架构、Domain 改造、Ports & Adapters、S3/DB 适配器 | **`../cloud-storage-hexagonal-architecture/SKILL.md`** |
| **🧠 AI Tool / Toolset 二开** | 新增 AI 工具、`ai_toolset`、tool schema、`inbound/toolset`、工具前端入口 | **`../create-ai-tool/SKILL.md`**（先读 `crates/ai_toolset/TOOL_DESIGN.md` 与框架示例；禁止修改 `crates/ai_toolset/` 框架本身） |
| **🧰 本地开发 / macOS / Docker / Local Stack** | macOS、Docker Desktop、OrbStack、Colima、`run_local`、`run_dev`、`doctor-local`、`status_local`、`stack up`、本地构建、端口冲突、Production Parity、本地复现 CI | **`skills/macro-local-environment/SKILL.md`** |
| **🔍 本地运行栈链路调试 / 真实复现** | 本地栈已启动、前端复现、500、请求链路、trace/log、Grafana、Loki、Tempo、浏览器 CDP | **`../live-debug/SKILL.md`**（优先用于跨服务请求链路、前端复现与运行中容器日志；需要单 crate 手动启动二进制时再用 `../debug-service/SKILL.md`） |
| **🔍 单 Rust 服务启动调试** | 单个 Rust crate/bin 启动失败、需要 `just run` + debug log、未运行完整本地栈 | **`../debug-service/SKILL.md`** |
| **📊 数据库 Schema / 迁移** | Migration、PostgreSQL 表字段、Email/Gmail 数据表、Dump | **`../dump-schema/SKILL.md`** |
| **🛡️ 发布前质检 / 审查门禁** | PR 审查、发布前验证、QC、精简度评估、稳定性检查 | **`../qc/SKILL.md`** |
| **📦 依赖治理 / 漏洞升级** | Dependabot、Cargo/Bun/NPM 依赖冲突、CVE 修复 | **`../dependabot/skill.md`** |
| **🔄 Upstream 同步 / 上游版本升级 / 冲突治理** | “同步上游”、“更新上游版本”、“Upstream Sync”、“sync PR”、“上游合并”、“解决冲突”、“定制保护”、“fork divergence”、“定制重叠”、“FORK-CUSTOM” | **`skills/macro-upstream-sync/SKILL.md`**（最高原则：绝不擅自做业务决策、专用 sync 分支保护 main、Customization Manifest 重叠分析、语义冲突非机械性审查、Generated 产物后置对齐、最终 Sync Report 门禁） |
| **🌐 i18n 国际化 / 显式化二开** | 多语言、i18n、翻译、显式 t()、excludePatterns、audit、词条提取 | **`references/i18n-workflow.md`**（**优先通过 CodeGraph 快速定位组件**，索引缺失时执行 `codegraph sync`） |
| **🎨 UI / UX / 设计系统二开** | 页面、组件、布局、颜色、字号、字体、图标、动效、交互、响应式、空状态、加载态、前端视觉调整 | **`skills/macro-ui-design/SKILL.md`**（官方组件优先、语义 Token、既有排版与动效、可访问性、真实浏览器验收） |
| **🚀 腾讯云 SG 生产运维 / 部署** | 生产环境、线上、部署、SSH、Docker Compose、生产更新、运维排障、腾讯云、SG、`marc-sg-2h8g` | **`references/production-deployment.md`**（默认连接 `marc-sg-2h8g`，主路径 `/home/ubuntu/marco/`；飞牛 OS 与美国 VPS 仅在用户明确指定时使用，凭据见 `.local-production.md`） |
| **⚠️ 易疏忽小问题 / 生产暗坑排查** | 邮件延迟、通知收不到、鉴权401、Webhook推送失败、配置无报错但无法工作、常见小Bug与配置疏忽 | **`生产环境配置与避坑指南.local.md`**（**必读防坑手册**，排查高频暗坑、受众配置与网络透传） |
| **🛡️ 推送与发布前契约门禁 / 离线对齐** | “推送”、“发布”、“发版”、“push”、“上线前检查”、“构建前校验”、“数据对不上”、“sqlx检查”、“离线编译” | **`../macro-pre-push-gate/SKILL.md`**（SQLx 离线元数据强一致性、SQLX_OFFLINE 生产编译仿真、未追踪孤儿文件扫描、前端轻量 tsc 与 Biome 审查） |

### 常用仓库技能引用优先级
这些技能是本仓库可直接复用的官方/仓库级能力。除非用户明确要求跳过，遇到对应任务时优先加载：

- **`skills/macro-local-environment/SKILL.md`**：本地开发栈、Docker、端口、`run_local`、CI parity。
- **`../live-debug/SKILL.md`**：运行中的本地栈排障、前端复现、跨服务 traces/logs/browser 调试。
- **`skills/macro-ui-design/SKILL.md`**：`apps/web` 用户可见 UI/UX 改动。
- **`skills/macro-upstream-sync/SKILL.md`**：同步 `macro-inc/macro` upstream。
- **`../cloud-storage-hexagonal-architecture/SKILL.md`**：Rust 后端架构与 ports/adapters 边界。
- **`../create-ai-tool/SKILL.md`**：新增或修改 AI tool/toolset。
- **`../dump-schema/SKILL.md`**：需要真实 MacroDB schema 证据。
- **`../macro-pre-push-gate/SKILL.md`**：推送、发版、PR 前门禁。
- **`../qc/SKILL.md`**：明确要求 QC 或发布前多视角审查。
- **`../dependabot/skill.md`**：Dependabot/CVE 依赖升级计划。
- **`../upgrade-model/SKILL.md`**：升级聊天模型 fast/good 槽位。

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
3. **禁止服务级最小集合导向**：不得为了减少构建范围而移除后端服务、Web 页面或 Web 功能。除桌面客户端、移动端客户端等非 Web 客户端外，默认保持全量源码、全量构建、全量验证。
4. **修改优先级原则**：配置 > 环境变量 > Adapter 替换 > 依赖注入 > 反代 Proxy > 小范围 Patch > 修改 Domain。
5. **凭据安全红线**：严禁在 Git 追踪的文件中硬编码真实服务器 IP、私钥、OAuth Secret 或 API Key。
6. **UI 设计系统一致性**：前端二开必须复用 Macro 官方 `@ui`、Kobalte primitives、Theme 语义 Token、既有字号与动效语言；禁止建立平行组件库、私有颜色体系、任意字号或无障碍不受控的自定义交互。
7. **上游/二开归因先行**：处理 CI、lint、typecheck、构建失败或 warning 前，先用 `git diff upstream/main -- <path>`、`git show upstream/main:<path>`、现有 workflow/just 脚本确认问题来源。结论必须区分：`上游已有`、`二开新增`、`二开触发上游隐患`。
8. **上游非阻断问题不主动改**：若 lint / type / test 输出来自 `upstream/main` 已存在的问题，且不影响当前构建、CI 门禁、生产运行或本次二开目标，只记录来源与风险，不为“清爽”而修改上游代码。避免把私有 fork 变成无关风格修复分支，增加后续 upstream merge 成本。
9. **二开代码必须贴合上游规范**：凡是本 fork 新增或本次触碰的二开代码，必须按上游现有目录边界、类型模型、query/service-client 分层、UI 组件规范、格式化与 lint 规则实现。若二开触发 warning/error，优先通过对齐上游模式修复；不要靠禁用规则、扩大类型、粗暴 cast、复制业务逻辑或改原始上游脚本来绕过。
10. **上游原生运维入口优先**：遇到生产/本地环境状态漂移、服务初始化顺序、外部系统配置缺失、IaC 未落地、数据库/FusionAuth/LocalStack/OpenSearch/Redis/Kafka 等运行时状态不一致时，先查仓库原生脚本、Just recipes、Pulumi/Terraform/IaC 栈、Docker Compose、迁移与 README，再判断是否为“脚本未执行 / import 未完成 / reconcile 未覆盖”。禁止先写新的旁路补丁、手工 curl 脚本或业务代码兜底来掩盖漂移。
11. **优先贴近 upstream 处理方式**：凡是 Macro 上游已有部署、初始化、导入、同步、回填、修复、seed、doctor、drift check、reconcile 等机制，优先复用或补齐调用路径；只有确认上游没有覆盖当前私有化场景时，才新增最小私有化封装，并明确标注原因与边界。
12. **构建入口与镜像清单同步铁律**：新增、移动或重命名任何源码文件后，必须检查并同步所有构建入口、`Dockerfile`、`Nix`、`Cargo.toml`、`Workspace`、复制清单与缓存输入，确认后端服务与 `apps/web` 实际进入构建上下文和最终制品；仅桌面客户端、移动端客户端等非 Web 客户端可按发布目标排除。


---

## 四、代码关系链与构建闭包穿透准则 (Cargo Tree 与 CodeGraph AST 双轨制)

依赖排查、构建入口核验与代码影响面分析必须严格遵循「Cargo 特性图」与「AST 语法树调用」双轨定位机制，严禁盲目递归 grep：

1. **Cargo 特性依赖图（谁把依赖拉进来的）**：
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
- **生产环境配置与高频暗坑排查指南 (Local Only)**：读取 [`生产环境配置与避坑指南.local.md`](file:///Volumes/开发/macro/生产环境配置与避坑指南.local.md)（已受 `.gitignore` 保护，遇到小 Bug、鉴权失败、Webhook 延迟、看似配置正确但无法运作时**必须优先查阅**）
- **高频问题知识沉淀机制**：在排查运维或开发中遇到“微小但极易疏忽”、“排查耗时长的隐蔽暗坑”（例如服务账号受众缺失、反代 Header 过滤、Token 续期、微服务路径映射等）时，必须主动提示主人：“该问题属于典型高频暗坑，是否同步沉淀写入 `生产环境配置与避坑指南.local.md` 或相关技能文档中？”

---

## 六、构建范围与辅助目录管理策略

1. **构建范围默认值**：
   - 后端 Rust workspace、服务镜像与 `apps/web` 默认全量构建；
   - 不再维护服务级最小集合、Email-only Profile 或类似的局部构建工作流；
   - 桌面客户端、移动端客户端等非 Web 客户端可以从发布构建中排除，但不得影响 `apps/web` 全量构建。

2. **`.sqlx/`（必须保留与 CI 一致性守则）**：
   - 离线查询元数据，修改 SQL 后必须在根目录执行 `nix develop --command just prepare_db` 更新，严禁手动编辑 JSON 文件。
   - **CI 离线构建与类型强对齐铁律**：GitHub Actions CI、Nix 容器镜像打包与发布流水线均在严格离线模式下编译（`SQLX_OFFLINE=true`，无直连数据库），Rust 编译类型严格由 `.sqlx/` 静态元数据决定。
   - **严禁私加 unwrap 破坏离线编译**：严禁为了迎合本地 live DB 的动态推断（例如 LEFT JOIN 从表字段被本地数据库临时推断为 `Option<T>`）而给字段盲目添加 `.unwrap_or_default()` 或破坏上游强类型契约。若 `.sqlx/` 中对应字段被录制为非空（`nullable: false`，如原生 `String`），调用 `unwrap_or_default()` 会在 CI / Nix 离线构建时抛出致命 `E0599` 错误导致整个流水线崩溃。
   - **对齐排查标准**：遇到 SQLx 类型存疑时，必须以 `SQLX_OFFLINE=true cargo check -p <crate>` 作为与 CI 离线构建对齐的真凭实据；如确需修改查询非空约束，应在 SQL 中使用 `AS "col!"` 强类型断言，并按规范执行 `just prepare_db` 同步更新 `.sqlx/` 目录。
3. **`.claude/`（保留）**：Claude 开发规范资产，不作为业务运行时删除。
4. **`.cursor/`（可清理）**：Cursor Cloud 开发辅助环境配置，自托管与生产部署不依赖。

---

## 七、验收门禁与分级测试策略 (Verification & Gates)

### 1. 分级验证原则（严格区分“日常轻量修改”与“推送/重大重构”）
> ⚠️ **核心准则**：严禁在每一次局部日常微调、UI/文案小修改、单一组件二开时机械盲目执行全局 heavy 检查或串行跑完所有脚本（如 audit、extract、test、biome check、tsc、cargo 全量等），避免极度拖慢开发节奏与消耗资源。

- **日常轻量小修改（如 UI 调整、页面文案/i18n 微调、单文件优化等）**：
  - **默认极轻量原则**：修改文件后利用本地 Vite/Solid 热更新（HMR，端口 3000）即时生效，直接向主人报告修改结果与浏览器验证路径；
  - **按需精准**：如涉及 CodeGraph 结构变更执行毫秒级增量 `codegraph sync`；禁止自动触发全局 `bun test`、全量 `extract.ts`、全库 `tsc` 或耗时静态扫描。
- **重大修改 / 核心架构重构（涉及多模块依赖流、核心类型、底层接口、公共基础设施改造）**：
  - 针对所触及的模块执行针对性单测与类型检查（如 `cargo test -p <crate>` 或定向单测）。

### 2. 推送 GitHub 远端门禁 (Pre-push CI & Lint Gate)
**仅在主人明确要求“推送 GitHub”、“提交 PR”、“准备发版”或“合流远端”时**，才触发完整的流水线前置校验：
1. **统一本地质检门禁**：
   - 执行 `just check`：执行 `rustfmt`、`biome`、`oxlint` 以及 `ast-grep` 语法树扫描。
   - 若改动涉及核心类型定义，执行 `just check full`（增加 `tsc` 与 `clippy` 全量分析）。
2. **私有化与零外部云防御检查**：
   - 确保没有引入写死的官方外部域名（如 `*.workers.dev`、`api.pipedream.com`、`macro-prox.*`、`*.posthog.com`、商业付费墙）。
   - 保持前置路由与 Onboarding 中第三方未配置连接器处于解耦/旁路状态。
3. **CI 对齐验证（GitHub Actions Parity）**：
   - 本项目 GitHub Actions CI 采用与本地一致的 `biome ci` 和 `ast-grep scan` 验证；本地 `just check` 通过即代表 CI 规范检查可完全通过。

### 3. 标准响应结构
每次任务完成时必须遵循：
1. 🔹方案概述（简短说明修改策略与架构归属，不要输出任何代码块）
2. 🔹已修改的文件路径（说明修改的绝对路径，不要输出任何代码块）
3. 🔹测试方法（如何验证功能正常，不要输出任何代码块）
4. 🔹可选优化（仅在具有高实际价值时提供，严禁低收益过度优化，不要输出任何代码块）
