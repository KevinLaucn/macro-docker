# 自托管健康检查 UI 开发计划

## 结论

可行。决定做成仅生产环境使用、`super_admin` 可见的后台健康检查页，入口放在设置侧栏 `Admin` 分组下，中文显示为“健康检查”，不放在普通“拓展”分组里。

原因：现有 `Extensions` 对所有用户可见；`Admin` 设置分组已经通过 `write:admin_panel` 权限控制，而数据库迁移已把该权限绑定到 `super_admin` 角色。

## 已确认现状

- 前端设置页入口集中在 `apps/web/src/lib/core/constant/settingsTabsConfig.tsx`。
- 当前 `Admin` 分组只有 `Debug`，由 `useHasPermission(PERMISSION_IDS.WRITE_ADMIN_PANEL)` 控制。
- `SettingsTab` 类型在 `apps/web/src/lib/core/constant/SettingsState.tsx`，新增页需要同步 tab 类型、slug、设置页 switch 渲染。
- 现有常驻通知能力可复用：`apps/web/src/lib/core/component/Toast/useKeyedPersistentToasts.ts`。
- Gmail 授权异常已有类似常驻提示实现：`apps/web/src/features/auth/GmailReauthenticationPrompt.tsx`。
- 现有脚本 `self-host/scripts/doctor.py` 已覆盖 LocalStack、SQS、S3、FusionAuth IdP、MacroDB 用户一致性、Gmail 授权、容器健康。
- 邮件打开追踪/像素追踪是二开功能，入口在“拓展”页，后端 public endpoint 为 `email-service` 的 `/t/o/{token}`，现有接入点带有 `PRIVATE-HOOK: read_receipts:*` 标记。
- 邮件翻译是二开功能，翻译结果主要缓存在浏览器内存和 `sessionStorage`，前缀为 `macro.trans.cache.`；现有 `clearTranslationCache()` 可清理该缓存。

## 推荐架构

### 0. 二开边界与门禁

必须按本 fork 二开规范实现：

- 与官方上游解耦：健康检查主逻辑放在独立二开模块，不把大量私有逻辑塞进官方原文件。
- 上游文件只做薄接入：设置页、router、Root 挂载等位置只保留 1-3 行接入代码。
- 接入点使用 `PRIVATE-HOOK:` 标记，并登记到 `.fork/customizations.yml` 或 private hooks manifest。
- 生产健康检查只依赖自托管生产环境，不 fallback 到 `*.macro.com` 官方云。
- 权限门禁使用现有 `super_admin -> write:admin_panel`，前端隐藏只是 UI，后端 API 必须强制校验。
- 本地开发门禁：非生产环境默认 disabled，避免本地栈/开发环境误触发生产检查。
- 构建门禁：新增模块后检查 Rust crate、Nix、Dockerfile、服务镜像复制清单和 `apps/web` 构建入口，保证进入最终制品。
- SQLx 门禁：新增历史表或查询后按仓库规范更新 `.sqlx/`，禁止手写 query metadata。

推荐文件边界：

- 后端二开核心：`services/authentication_service/src/features/self_host_health/`
- 前端二开核心：`apps/web/src/features/self-host-health/`
- 设置页薄接入：`SettingsState.tsx`、`settingsTabsConfig.tsx`、`Settings.tsx`
- 全局常驻通知薄接入：`Root.tsx` 或现有全局 prompt 汇总位置

### 1. 后端诊断接口

新增内部健康诊断接口，建议挂在 `authentication-service`：

- `GET /admin/health-check`
- 仅允许 `write:admin_panel` 权限访问。
- 返回结构化 JSON，不直接把 `doctor.py` 文本输出透给前端。
- endpoint 内部调用独立 health probe 模块，不把业务逻辑写进 router。
- 仅在生产环境启用；非生产环境返回 disabled 状态或 404/403，避免误把本地开发栈当生产监控。
- 需要服务端审计日志：记录谁触发了手动检查、检查耗时、critical 变更。
- 不给 `authentication-service` 挂 Docker socket。容器状态、宿主机磁盘等宿主机级检查继续留给 `doctor.py` / SSH 层。

建议数据结构：

- overall status：`ok` / `warning` / `critical`
- last checked time
- next scheduled check time
- duration ms
- checks list：
  - id
  - name
  - category
  - status
  - message
  - details
  - remediation hint

### 2. 诊断模块拆分

推荐新增 fork 专属模块：

- `services/authentication_service/src/features/self_host_health/`

分类：

- `auth`：`/health`、FusionAuth 可访问、IdP 配置、`super_admin` 角色权限。
- `database`：MacroDB 连接、关键表存在、`User.macro_user_id` 与 `macro_user.id` 一致性。
- `storage`：S3 bucket 列表、读写最小探针、CORS/权限。
- `queues`：SQS 队列存在、关键队列积压、DLQ 数量。
- `redis`：Redis ping、队列/缓存可访问。
- `webhook`：内部 webhook 配置、签名密钥存在、最近失败统计。
- `gmail`：OAuth client 配置、linked inbox `needs_reauth`、Gmail watch / push webhook 状态、最近同步时间、同步进度。
- `read_receipts`：邮件打开追踪配置、追踪像素 public endpoint、反代路径、返回内容类型、最近打开记录写入状态。
- `email_translation`：浏览器翻译能力可用性、翻译开关状态、本地翻译缓存清理入口。
- `dss`：Document Storage Service HTTP health、`/dss/*` 反代、文档 S3 bucket、internal auth key。
- `services`：关键微服务 HTTP health endpoint；不在 Rust API 内直接读取 Docker 容器状态。
- `history`：记录当前状态、最近检查时间、首次失败时间、连续失败次数。

优先直接用 Rust 实现检查逻辑；`doctor.py` 只作为对照和本地 CLI 兼容入口。原因是 Rust 服务内可以更自然地复用数据库连接、权限校验、配置读取、超时控制和结构化响应。

### 3. 前端 UI

新增页面：

- `apps/web/src/features/settings/SelfHostHealth.tsx`

接入位置：

- `SettingsState.tsx` 增加 `SelfHostHealth` tab。
- `settingsTabsConfig.tsx` 在官方 `Admin` 分组增加“健康检查”，与现有 `Debug` 并列，仍复用 `WRITE_ADMIN_PANEL` gate。
- `Settings.tsx` 增加对应页面渲染。
- 新增 `apps/web/src/lib/queries/self-host-health/` 或按现有查询分层放入 `src/lib/queries`。

UI 内容：

- 顶部总状态：正常 / 有警告 / 严重故障。
- 分组卡片：认证、数据库、存储、队列、Gmail、Webhook、DSS 文档存储、邮件打开追踪、邮件翻译、服务运行态。
- 每项显示状态、最近检查时间、错误原因、建议修复动作。
- 提供“立即重新检查”按钮。
- 保留最近一次成功结果和最近一次失败结果，避免接口短暂失败时页面空白。
- UI 保持轻量：默认只展示状态、官方估算数量、本地落库数量、差值、上次检查时间；详情折叠展示。

## 常驻通知方案

推荐复用 `useKeyedPersistentToasts`，新增全局挂载组件：

- `apps/web/src/features/self-host-health/SelfHostHealthPrompt.tsx`

规则：

- 仅 `super_admin` / `write:admin_panel` 用户启用轮询和提示。
- 默认只对 `critical` 做右下角常驻提示。
- 问题恢复后自动 dismiss。
- 用户手动关闭后，只在当前问题仍存在时可短暂隐藏；建议 30 分钟后重新提示。
- 如果出现新的 failure key，立即重新提示。

这里不能用普通 `toast.failure`，因为它会自动消失；必须用 persistent keyed toast。

`warning` 和 `critical` 的区别：

- `warning`：服务还能工作，但存在风险或退化。例如队列积压偏高、Gmail watch 快过期、某个非关键 worker 延迟。
- `critical`：核心链路已经不可用或即将导致业务失败。例如 auth 不可用、数据库不可连、S3 写入失败、SQS/DLQ 爆了、Gmail push webhook 失效、关键服务 unhealthy。
- 像素追踪 `/t/o/{token}` 返回 404、401/403、5xx，属于 `critical`；返回 400 通常说明请求格式、反代或路由约束异常，也按 `critical` 处理。

推荐常驻策略：只常驻 `critical`。`warning` 只在健康检查页展示，必要时在页面内标黄；否则右下角会太吵，最后反而没人看。

## 轮询频率建议

推荐：2 分钟。

原因：

- 1 分钟适合极轻量的单 endpoint ping，不适合包含数据库、SQS、S3、Gmail、容器状态的综合检查。
- 2 分钟对自托管 SaaS 足够及时，且不会给小型 2H8G 主机增加明显压力。
- 页面打开时立即查一次，后台轮询 2 分钟一次。
- Gmail 官方数量 `users.getProfile` 检查默认也跟随 2 分钟轮询；该 API 很轻，主要用于展示 `messagesTotal` / `threadsTotal` / `historyId`。
- 如果已连接邮箱超过 50 个，Gmail 官方数量检查自动降频到 5-10 分钟，或按邮箱分批轮询，避免配额尖峰。
- 失败状态下可临时缩短到 60 秒；连续 3 次正常后恢复 2 分钟。

重检查按钮不受轮询限制，但后端应做 10-15 秒最小间隔缓存，避免重复点击打爆外部依赖。

## 像素追踪检查

目标：验证“邮件打开追踪”不是只在前端开关存在，而是生产公网链路真的可达。

检查项：

- 全局开关 `email_extension_settings.email_open_tracking_enabled` 可读取。
- `email-service` public base URL 配置正确。
- 生产反代能访问 `GET /t/o/{token}`，或部署路径下的 `/email/t/o/{token}`。
- 返回状态必须是 `200`。
- `Content-Type` 应为 `image/gif`。
- 响应体应为 1x1 透明 GIF。

探针方式：

- 使用随机 UUID token 发起 GET，例如 `/t/o/{random_uuid}`。
- 随机 UUID 不对应真实邮件，正常行为仍应返回 `200 image/gif`，并且不会产生真实打开记录。
- 这只验证公网 Caddy / 反代、`email-service`、router、handler 是否可达。
- DB 写入能力单独检查：读取最近 tracking 记录，或检查 read receipts 相关表/索引/最近写入错误日志。

状态判断：

- `200`：正常。
- `404`：critical。通常是反代路径没转到 `email-service`，或 read receipts public router 没挂载。
- `400`：critical。当前实现不应该因为随机 UUID 返回 400；如果出现，多半是网关、路径重写或请求格式约束问题。
- `401/403`：critical。像素 endpoint 应该是公开匿名访问；出现鉴权说明反代或中间件错误。
- `5xx`：critical。通常是 `email-service`、数据库或内部依赖异常。
- 超时：critical。说明公网访问链路不可用或服务卡死。

注意：不要用真实邮件 token 做健康检查，避免制造虚假的已读记录。

## 邮件翻译缓存清理

目标：给二开邮件翻译增加一个轻量维护入口，方便用户清理浏览器本地翻译缓存。

现状：

- 翻译结果文本缓存位于 `apps/web/src/features/email-translation/translationCache.ts`。
- 缓存包含内存 `Map` 和 `sessionStorage`。
- `sessionStorage` key 前缀为 `macro.trans.cache.`。
- 已存在 `clearTranslationCache()`，可以直接复用。
- 邮件正文翻译状态在 `emailTranslationState.ts` 的 Solid store 中，刷新页面后会丢失。

实现建议：

- 在“拓展 > 邮件功能增强 > 电子邮件翻译”这一行旁边增加一个小按钮：“清理缓存”。
- 点击后调用 `clearTranslationCache()`，并清理当前页面内的邮件翻译状态。
- 成功后显示普通 toast：“翻译缓存已清理”。
- 该按钮不需要后端 API，不进入生产健康检查轮询。

注意：

- 这是本地浏览器缓存清理，不是服务端数据清理。
- 只影响当前浏览器/当前标签页会话，不影响其他用户和其他设备。
- 不应清理整个 `sessionStorage`，只删除 `macro.trans.cache.` 前缀的翻译缓存。

## Gmail 同步进度

目标：显示 Gmail 邮件同步是否正在健康推进。这个默认是进度信息，不作为错误。

检查项：

- 本地 `email_threads` 数量。
- 本地 `email_messages` 数量。
- Gmail 官方实时 `threadsTotal` / `messagesTotal` 估算数量。
- 最近同步游标 / historyId。
- 最近一次成功同步时间。
- 当前是否有同步任务在运行。
- SQS 同步队列积压数量。
- DLQ 数量。

检查范围：

- 只检查当前 `super_admin` 账号下已连接的邮箱。
- 不扫描全站所有用户邮箱，避免越权展示和不必要 Gmail API 调用。

UI 显示：

- 邮箱地址。
- Gmail 官方话题数 / 邮件数。
- 本地已落库话题数 / 邮件数。
- 差值。
- 同步状态。
- 上次检查时间。

状态判断：

- 同步任务正常运行且数量持续增长：`info`。
- 本地数量少于 Gmail 官方数量，但仍在追赶：`info`。
- 官方数量与本地落库数量差值只作为 `info` 展示，不直接判异常。
- sync cursor / historyId 长时间不推进、最近成功同步时间过旧、worker 无进展、SQS 积压异常：`warning`。
- Gmail 授权失效、watch/push webhook 失效、同步 worker 挂掉、SQS/DLQ 严重积压：`critical`。

注意：

- Gmail 官方数量通过 Gmail API 实时读取，但只能作为参考值，不应要求完全一致。
- 数量差异常见于分页、过滤、label 范围、已删除邮件、垃圾邮件、历史同步窗口。
- 因 Gmail 同步是核心功能，异常判断看“是否还在推进”，不看固定数量差。
- 右下角常驻通知只在进入 `critical` 时触发。

## DSS 文档存储检查

目标：验证 Document Storage Service 文档核心链路可用。

检查项：

- `GET /health` 返回 `200`。
- 生产反代 `/dss/*` 是否正确转发到 `document_storage_service`。
- 文档 S3 bucket 是否存在。
- 文档 S3 bucket 最小读写探针是否成功。
- internal auth key / header 是否配置正确。

状态判断：

- `/health` 不通：`critical`。
- 文档 S3 bucket 不存在或不可读写：`critical`。
- `/dss/*` 反代错误：`critical`。
- internal auth key 配置错误：`critical`。

原因：文档创建、保存、导出、快照、附件读取、部分 bot webhook 都依赖 DSS；异常时属于核心业务不可用。

## 现有 `doctor.py` 复用判断

可以复用检查思想，不建议前端直接依赖脚本输出。

推荐做法：

- 第一阶段：直接在 Rust health probe 模块实现生产检查。
- 第二阶段：让 `doctor.py` 增加 `--json` 或改为调用生产健康接口，作为 SSH/CLI 兜底工具。

原因：

- UI 需要结构化状态、分类、时间、严重级别。
- 脚本文本输出适合 CLI，不适合稳定 API 契约。
- Rust 服务内做权限控制、缓存、超时、审计更自然。

## 简化历史记录

第一版不做完整监控系统，只保留最小状态：

- 当前状态。
- 最近一次检查时间。
- 首次失败时间 `failure_since`。
- 连续失败次数。

存储方式推荐先用一张小表或 Redis/cache：

- `self_host_health_check_state`

等需要历史图表、审计报表或趋势分析时，再扩展为 runs/events 两张表。

## 用户遗漏项

建议补充：

- OpenSearch 健康：搜索不可用会影响文档/邮件检索。
- Kafka 健康：如果当前部署仍依赖事件流，需要检查 broker 与 topic。
- LocalStack KMS / DynamoDB：现有 `doctor.py` 文档写了，但当前脚本只显式查了部分资源。
- 邮件打开追踪像素：检查 `/t/o/{token}` 是否公网 200、反代是否正确、是否仍返回 `image/gif`。
- 邮件翻译本地缓存清理：在“拓展”页增加清理按钮，避免翻译结果异常时必须手动刷新或清浏览器数据。
- DSS 文档存储：检查 `/health`、`/dss/*` 反代、文档 S3 bucket、internal auth key。
- 后台 worker 消费延迟：只查队列存在不够，要查积压和 DLQ。
- 服务间 internal auth key：错误会造成 webhook、sync、storage 调用失败。
- 磁盘空间：自部署最常见故障之一，尤其 Postgres、OpenSearch、Docker volume。
- SSL / public URL / reverse proxy：Gmail push、OAuth callback、webhook 都依赖公网回调正确。
- 系统时间漂移：OAuth、JWT、签名校验都依赖时间。
- 最近失败事件：比单次 ping 更有价值，例如最近 15 分钟 Gmail watch renewal / webhook failure。
- Gmail 同步进度：显示本地邮件/话题数量与 Gmail 官方估算数量差异，但只作为进度，不直接判错。

## 分期计划

### Phase 1：只读健康面板

- 新增 super_admin 可见设置入口。
- 后端新增 `GET /admin/health-check`。
   - Rust 实现最小生产探针。
   - 前端展示分类状态和手动刷新。
   - 展示最小状态：当前状态、`last_checked`、`failure_since`、`consecutive_failures`。
   - 加入像素追踪 endpoint `200 image/gif` 检查。

验收：

- 普通用户不可见且 403。
- super_admin 可见。
- 故障项能显示明确原因。

### Phase 2：常驻故障通知

- 新增全局 `SelfHostHealthPrompt`。
- 仅 super_admin 轮询。
- critical 故障常驻，恢复后自动消失。

验收：

- 制造一个 S3/SQS/FusionAuth/Gmail 异常后，右下角常驻提示。
- 修复后提示自动消失。

### Phase 3：深度业务契约检查

- 加入 Gmail watch/push、Gmail 同步进度、像素追踪写入状态、recent sync、DLQ、OpenSearch、Kafka、反代配置。
- 宿主机磁盘和 Docker 容器状态保留在 `doctor.py` / SSH 层，不通过 `authentication-service` 读取。
- 加入每项 remediation hint。
- 加入后端缓存、超时、并发限制。

验收：

- 单项超时不会拖垮整个接口。
- 每个检查项有独立状态和耗时。

## 风险点

- 不能把真实密钥、OAuth secret、数据库连接串返回前端。
- 不能让普通管理员看到内部基础设施状态。
- 不能让健康检查本身频繁触发昂贵 Gmail API 调用。
- 不能在检查里写入业务数据；S3 读写探针如需写入，必须使用专用临时 key 并清理。
- 不能把生产环境健康检查依赖官方 Macro 云服务。
- 不能为了健康检查给 `authentication-service` 挂载 `/var/run/docker.sock`。

## 建议开发顺序

1. 后端定义 `SelfHostHealthReport` 类型和权限受控 API。
2. 新增 Rust 二开模块 `features/self_host_health`，实现生产最小探针。
3. 新增 MacroDB 最小状态表或 Redis/cache 状态记录。
4. 前端新增 `features/self-host-health` 和设置页薄接入。
5. 增加 persistent toast prompt。
6. 同步 `.fork/customizations.yml` / private hooks manifest，登记所有 `PRIVATE-HOOK:`。
7. 检查 Nix、Dockerfile、服务镜像清单、OpenAPI/service client 生成路径。
8. 让 `doctor.py` 后续改为调用同一健康接口，作为 CLI 兜底工具。

## 本地门禁清单

开发完成后至少执行：

- `codegraph sync /Volumes/开发/macro`
- `SQLX_OFFLINE=true cargo check -p authentication_service`
- `cd apps/web && bun run check`
- `just check`（准备提交或推送前）

涉及生产发布前再执行：

- `nix develop --command just prepare_db`
- `just check full`
- 生产 SSH 到 `marc-sg-2h8g` 后验证 `/admin/health-check`、`/t/o/{random_uuid}`、Gmail watch/push、SQS/DLQ。
- 宿主机磁盘和 Docker 容器状态用 `doctor.py` / SSH CLI 验证。
