# Self-Host Rust Core 构建性能与优化审计 (BUILD-OPTIMIZATION.md)

## 1. 当前问题与背景

在 GitHub Actions 工作流 `Self-host images` (run `33815723685` / job `100847382960`) 中，`macro-services` 在 `Build service binaries` 步骤执行时间超过 1 小时 20 分钟并持续处于 in_progress 状态。

构建命令：
```bash
nix build --print-build-logs ".#local-stack-binaries" --out-link result-bins
```

## 2. 根本原因深度剖析 (Top 3 瓶颈)

### 原因一：GitHub-Hosted Runner 无持久化 /nix/store 与冷构建开销
当前 `macro-services` 运行在 GitHub 托管的临时 runner (`runs-on: ubuntu-latest`) 上。每个 job 启动时都是一台全新的临时 VM：
- `/nix/store` 为空，每次需要重新安装 Nix daemon。
- 尽管 `setup-nix` 支持 S3 binary cache，但当前私有仓库未配置 `NIX_CACHE_URL`、`NIX_CACHE_PUBLIC_KEY`、`AWS_ACCESS_KEY` 等变量，无法命中外部二进制缓存。
- 临时 runner 销毁后，所有编译产物与 Rust 依赖全部丢失，下一次构建依然是 100% 冷构建。

### 原因二：`.#local-stack-binaries` 全量聚合体庞大，构建闭包过大
`.#local-stack-binaries` 是为了本地开发全量环境设计的 aggregate：
- 包含 16 个以上的服务和工具：`agent-harness-service`, `agent-schedule-service` (`scheduled_action`), `connection-gateway`, `contacts-service`, `document-cognition-service`, `document-storage-service`, `email-service` (`email_service` + `pubsub_workers`), `image-proxy-service`, `mcp-server`, `notification-service`, `static-file-service`, `unfurl-service`, `search_processing_service`, `document_upload_finalizer_handler`, `agent_trigger_service`, `seed_cli` 等。
- `deployCargoArtifacts` 使用 `deployBinaryCargoExtraArgs` 预构建了全量包依赖。依赖树中包含大型 Git 依赖（如 `turso_core`、`agent-client-protocol`）以及复杂的 C/C++ 原生链接库（`librdkafka`、`openssl`、`libclang`）。
- 许多与邮件核心业务完全无关的重型服务（如 AI Agent 调度、Daytona 沙箱沙盒、MCP、Scheduled Actions 等）被无差别地强制拉入编译。

### 原因三：生产 Auth 双重编译与二次 Cargo 构建
当前流水线中存在重复编译行为：
1. `local-stack-binaries` 默认编译了带有 `--features return_passwordless_code` 的开发版 `authentication_service`。
2. 随后为了生产安全，工作流又单独执行了 `nix build ".#deploy-service-binaries-authentication-service"` 编译生产版 `authentication_service` 并进行覆盖。
3. 接着在 `Build the migration runner` 步骤中，又通过 `nix develop --command cargo build --release -p macro_db_migrator ...` 在 checkout 目录内直接调用 cargo release 构建，未有效复用 Nix crane 预构建的依赖层。

---

## 3. Email 核心服务与依赖关系审计

用户核心场景为：Gmail OAuth、Gmail 邮件收发、邮件同步、线程会话、收件箱、历史邮件搜索、联系人、附件管理、已读回执与追踪、认证与 WebSocket 实时推送。

| 服务 / 组件 | 归属分类 | 决定 | 核心理由 |
|---|---|---|---|
| `authentication_service` | 认证鉴权 | **KEEP** | 用户登录、会话管理、OAuth Token 校验核心 |
| `connection_gateway` | 实时网关 | **KEEP** | 前端 WebSocket 网关，实现邮件与状态实时推流 |
| `contacts_service` | 联系人 | **KEEP** | 邮箱联系人联想、搜索与元数据管理 |
| `email_service` (含 `pubsub_workers`) | 邮件收发与同步 | **KEEP** | 邮件处理主体，负责 Gmail 同步、Pub/Sub 事件消费、发送与追踪 |
| `document_storage_service` | 存储核心 | **KEEP** | 邮件正文、富文本附件与对象存储依赖 DSS 接口 |
| `static_file_service` | 静态资产/附件直传 | **KEEP** | 浏览器直接下载/上传邮件附件与静态文件的直连网关 |
| `search_processing_service` | 搜索索引 | **KEEP** | 历史邮件与正文在 OpenSearch 中的索引处理器 |
| `document_upload_finalizer_handler` | 附件上传完成确认 | **KEEP** | S3 / LocalStack 附件上传后触发元数据写入与最终确认 |
| `image_proxy_service` | 邮件图片代理 | **KEEP** | 邮件外部图片防追踪代理，保障邮件客户端隐私与安全加载 |
| `notification_service` | 通知服务 | **KEEP (保守)** | 前端新邮件提醒与角标通知相关路由 |
| `unfurl_service` | 链接解析 | **KEEP (保守)** | 邮件内容中外链预览与元数据解析 |
| `scheduled_action` | 周期调度 | **DROP** | Agent 周期轮询，纯邮件业务不依赖 |
| `agent_harness_service` | AI 智能体执行 | **DROP** | AI Coding 与 Docker 沙箱执行引擎，邮件核心无需此服务 |
| `agent_trigger_service` | 智能体触发器 | **DROP** | AI 智能体监听与调度，邮件核心无需 |
| `mcp_service` | MCP 协议服务 | **REMOVED** | 代码库已物理移除，无需编译 |
| `document_cognition_service` | AI 文档感知/总结 | **DROP** | 大模型文档总结与 OCR，邮件基础功能无需 |
| `seed_cli` | 本地测试工具 | **DROP** | 开发调试工具，生产环境严禁携带 |

---

## 4. 优化架构方案设计

### 4.1 引入 `self-host-email-binaries` 专用 Nix 聚合包与独立依赖闭包
在 `nix/cloud-storage.nix` 中：
- 保留 `local-stack-binaries` 不受任何破坏。
- 新增 `selfHostEmailBinaryDefinitions`（定义 11 个核心包，共产生 12 个二进制文件）：
  - 包含：`authentication_service` (生产模式), `connection_gateway_service`, `contacts_service`, `document_storage_service`, `email_service` (产出 `email_service` + `pubsub_workers`), `image_proxy_service`, `notification_service`, `static_file_service`, `unfurl_service`, `search_processing_service` (带 processing,service 特性), `document_upload_finalizer_local_worker`。
  - **核心依赖隔离**：不再复用包含 Full Stack 全部依赖的 `deployCargoArtifacts`，而是专门为 Email 构建 `selfHostEmailCargoArtifacts = craneLib.buildDepsOnly`，通过 `selfHostEmailBinaryCargoExtraArgs` 严格限制只预编译 Email roots 的 Cargo 依赖树。
  - **Workspace/source 隔离**：根据 `.github/workspace-dep-closures.json` 计算 Email roots 的 workspace union，生成只包含该 union 的根 `Cargo.toml`，并让 `vendorCargoDeps`、`mkDummySrc`、dependency artifacts 和每个 leaf source 全部从该裁剪源开始。无关 workspace manifest 不再进入 Email profile 的固定 Nix 输入图。
  - 当前保守服务集的 workspace union 仍然较大，主要由 `document_storage_service`、`search_processing_service` 和 upload finalizer 的真实依赖造成。继续缩小必须通过上游兼容的 Cargo feature/adapter 边界完成，不能删除真实依赖或伪造 API 响应。
  - 将 `deployServiceBinaryPackage` 参数化，使 Email 包全部消费独立的 `selfHostEmailCargoArtifacts`。
- 导出 `self-host-email-binaries`。

### 4.2 镜像名称与 Tag 隔离（Profile 分离）
- **Full Profile**：
  - 服务镜像：`ghcr.io/kevinlaucn/macro-services:$VERSION`
  - 初始化镜像：`ghcr.io/kevinlaucn/macro-init:$VERSION`
- **Email Profile**：
  - 服务镜像：`ghcr.io/kevinlaucn/macro-services-email:$VERSION`
  - 初始化镜像：`ghcr.io/kevinlaucn/macro-init-email:$VERSION`
- 消除 tag 覆盖冲突，生产环境可按需拉取指定 profile 镜像。

### 4.3 支持持久化 Linux Builder (Self-Hosted Runner)
- 支持注册带标签 `[self-hosted, linux, x64, macro-builder]` 的专用独立 Linux 编译机。
- 专用 Builder 拥有持久的 `/nix/store` 和 Docker 缓存层，第二次构建即可享受极高的 Nix closure 缓存命中率。
- 生产 VPS（`/opt/macro/current`）坚决不承担任何编译任务，仅负责 pull 镜像与启动容器。

### 4.4 工作流（Workflow）支持双 Runner 与双 Profile
- 在 `.github/workflows/self-host-images.yml` 中新增 `services_runner` (`github` / `self-hosted`，默认 `github`)。
- 新增 `profile` (`full` / `email`，默认 `full` 用于全量兼容，按需选择 `email`)。
- 增加 `concurrency` 控制，避免多次触发导致的无谓算力排队。
- 自动化 `init` 步骤：根据 `profile` 自动选用匹配的 `macro-services[-email]` 提取 migration runner 并发布对应的 `macro-init[-email]` 镜像。
- `macro_db_migrate` 已进入 Full 与 Email 的 Nix/crane 聚合体系，workflow 不再执行 checkout-local `cargo build --release`。
- Email profile 只发布 `sync`、`lexical`、`websocket` worker；AI Editing 与 Analytics 仅由 Full profile 发布。

### 4.5 单 Compose 的生产运行 Profile
- `self-host/docker-compose.yml` 默认使用 `macro-services-email` / `macro-init-email`。
- `document_cognition_service`、`scheduled_action_service`、`ai_editing_worker` 位于 Compose `full` profile，默认邮件生产不会启动缺失的二进制。
- Full 运行仍使用同一 Compose 文件：配置 Full 镜像名后执行 `./macroctl up --profile full`。
