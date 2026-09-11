# Macro 隐藏开关、角色与权限梳理

来源基于当前仓库代码：

- `apps/web/src/lib/core/constant/featureFlags.ts`
- `apps/web/src/lib/core/constant/permissions.ts`
- `apps/web/src/lib/debugSettings.ts`
- `crates/roles_and_permissions/src/domain/model.rs`
- `crates/macro_db_client/migrations/*roles_and_permissions*.sql`
- `self-host/docker-compose.yml`

## 结论

Macro 的“隐藏能力”不是一套系统，而是五套叠在一起：

1. 前端 Feature Flag：控制 UI 入口、实验功能、灰度功能。
2. PostHog-only Flag：没有 env 绑定，自托管 `window.__MACRO_ENV__` 写了也不生效。
3. 自托管能力开关：避免前端请求未部署的后端服务。
4. RBAC 角色/权限：真正决定付费、管理员、AI、IT、邮件工具等权限。
5. 本地 Debug 开关：只在客户端 localStorage 生效。

真正接近“给付费人员用”的是 RBAC 权限和角色，不是全部 Feature Flag。

## 前端开关读取规则

`defineFlag({ env: 'XXX' })` 会按顺序读取：

1. `window.__MACRO_ENV__.XXX`
2. `window.__MACRO_ENV__.FEATURES.XXX`
3. `import.meta.env.VITE_XXX`
4. 默认值 / PostHog

所以生产自托管推荐写入 `/app/env-config.js` 的 `window.__MACRO_ENV__`。

## 已绑定 env 的前端功能开关

这些可以通过 `window.__MACRO_ENV__` 或 `VITE_` 控制。

### 全局与新版界面

| 开关 | 默认 | 作用 |
| --- | --- | --- |
| `ENABLE_NEW_APP_VIEWS` | PostHog | 新版 Inbox / Tasks / Channels 组合视图 |
| `ENABLE_SIDEBAR_NEXT` | PostHog | 新版左侧窄图标侧边栏 |
| `ENABLE_ONBOARDING_V4` | dev 开 | 新版全屏 onboarding |
| `ENABLE_NEW_PRICING` | dev 开 | 新版定价/付费界面 |
| `ENABLE_AUTO_UPDATE_UI` | 反向控制 | 开启前端自动更新 UI；代码内实际对照 `disable-auto-update-ui` |
| `DISABLE_BROWSER_TURSO_CACHE` | PostHog | 紧急关闭浏览器 Turso/GraphQL 本地缓存 |

### 自托管能力裁剪

| 开关 | 默认 | 作用 |
| --- | --- | --- |
| `ENABLE_COGNITION` | 自托管默认关 | 文档认知/AI 理解服务 |
| `ENABLE_SCHEDULED_ACTIONS` | 自托管默认关 | 定时动作服务 |
| `ENABLE_AGENTS` | 自托管默认关 | Agent 后端能力 |
| `ENABLE_DOCS_COLLAB` | 自托管默认关 | 文档协同后端能力 |

注意：`FEATURES.cognition / scheduledActions / agents / docsCollab` 也会影响这些能力。

### AI / Agent

| 开关 | 默认 | 作用 |
| --- | --- | --- |
| `ENABLE_CHAT_V3_AGENTS` | 依赖 `ENABLE_AGENTS` | 频道内 Agent / @mention |
| `ENABLE_AGENT_SESSION_COMPOSER` | dev 开 | 创建 Agent 会话前选择 agent、模型、提示词 |
| `ENABLE_CURSOR_AGENTS` | 依赖 `ENABLE_AGENTS` | Cursor Agents 集成入口 |
| `INLINE_AI_EDITING` | dev 开 | 划词 AI 编辑胶囊 |
| `ENABLE_MARKDOWN_AI_GENERATE` | 关 | Markdown AI 生成 |
| `ENABLE_HOME_RECOMMENDATIONS` | dev 开 | Home 页 AI 推荐 |
| `ENABLE_TTFT` | dev 开 | AI 首 token 延迟显示 |

### Email

| 开关 | 默认 | 作用 |
| --- | --- | --- |
| `ENABLE_EMAIL` | 开 | 邮件模块 |
| `ENABLE_EMAIL_SHARING` | 开 | 邮件分享入口 |
| `ENABLE_EMAIL_SIGNATURES` | dev 开 | 邮件签名 |
| `ENABLE_EMAIL_SCHEDULED_SEND` | 开 | 定时发送 |
| `ENABLE_DIRECT_ATTACHMENT_DOWNLOAD` | 关 | 附件绕过 DSS，直接从 email service/Gmail 下载 |
| `ENABLE_PROXY_EMAIL_IMAGES` | 开 | 邮件图片代理加载 |
| `ENABLE_CLIENT_EMAIL_SIGNAL_FILTER` | 关 | 客户端邮件 signal 过滤 |
| `ENABLE_INBOX_RESYNC` | 关 | Inbox 重新同步入口 |
| `ENABLE_INBOX_SYNC_STATUS` | 开 | Inbox 同步状态 |
| `ENABLE_INBOX_NOTIFIED_SORT` | 关 | 按通知状态排序 Inbox；自托管建议保持关 |
| `ENABLE_MULTI_INBOX` | dev 开 | 多邮箱统一入口 |

### Calendar

| 开关 | 默认 | 作用 |
| --- | --- | --- |
| `ENABLE_CALENDAR_UI` | dev 开 | 日历主界面 |
| `ENABLE_CALENDAR_SEARCH_UI` | dev 开 | 日历事件搜索 |
| `ENABLE_CALENDAR_TEAM_OOO` | dev 开 | 团队外出/休假状态 |
| `ENABLE_CALENDAR_PROMPT_WEB` | PostHog | Web 端启用日历提示 |
| `ENABLE_CALENDAR_PROMPT_MOBILE` | PostHog | 移动端启用日历提示 |

### CRM / 团队协作

| 开关 | 默认 | 作用 |
| --- | --- | --- |
| `ENABLE_CRM` | dev 开 | Companies / Contacts / CRM |
| `BOT_MANAGEMENT` | dev 开 | 团队 Bot 管理 |
| `ENABLE_TAG_TEAM_SHARING` | dev 开 | 个人标签共享给团队 |
| `ENABLE_ENTITY_ACTIVITY_SECTION` | dev 开 | 实体详情活动时间线 |
| `ENABLE_ACTIVITY_FEED` | dev 开 | 全局 Activity 动态流 |
| `ENABLE_RECENT_VIEW` | dev 开 | 最近访问/编辑视图 |
| `ENABLE_NOTIFICATION_SETTINGS` | dev 开 | 通知设置页 |

### Markdown / 文档

| 开关 | 默认 | 作用 |
| --- | --- | --- |
| `ENABLE_MARKDOWN_LIVE_COLLABORATION` | 关 | Markdown 多人协作 |
| `ENABLE_MARKDOWN_COMMENTS` | 开 | Markdown 行级评论 |
| `ENABLE_MARKDOWN_DIFF` | 开 | Markdown 历史差异对比 |
| `ENABLE_MARKDOWN_SIDE_PANEL` | 开 | Markdown 右侧面板 |
| `ENABLE_MARKDOWN_SEARCH_TEXT` | dev 开 | Markdown 正文全文搜索 |
| `ENABLE_DOCUMENT_MENTION_NOTIFICATIONS` | dev 开 | 文档 @ 提及通知 |
| `ENABLE_HISTORY_COMPONENT` | dev 开 | 历史版本组件 |
| `ENABLE_GIT_BLAME` | dev 开 | 行级作者追溯 |
| `ENABLE_REFERENCES_MODAL` | 开 | 反向链接/引用弹窗 |
| `ENABLE_MENTION_TRACKING` | 开 | 全局提及追踪 |
| `ENABLE_STATIC_DOCUMENT_CARDS` | 关 | 静态文档卡片渲染 |
| `ENABLE_BLOCK_IN_BLOCK` | 开 | 文档内嵌 block/card |
| `ENABLE_DOCX_TO_PDF` | 开 | Docx 转 PDF |
| `ENABLE_PROJECT_SHARING` | 开 | 项目共享 |

### PDF

| 开关 | 默认 | 作用 |
| --- | --- | --- |
| `ENABLE_PDF_MODIFICATION_DATA_AUTOSAVE` | 开 | PDF 修改数据自动保存 |
| `ENABLE_PDF_LOCATION_AUTOSAVE` | 开 | PDF 阅读位置自动保存 |
| `ENABLE_PDF_TABS` | 开 | PDF 标签页 |
| `ENABLE_PDF_MARKUP` | 开 | PDF 标注 |
| `ENABLE_PDF_MULTISPLIT` | 开 | PDF 多分屏 |
| `ENABLE_SCRIPTING` | 关 | PDF scripting |

### Canvas / 媒体

| 开关 | 默认 | 作用 |
| --- | --- | --- |
| `ENABLE_CANVAS_IMAGES` | 开 | Canvas 图片 |
| `ENABLE_CANVAS_FILES` | 开 | Canvas 文件 |
| `ENABLE_CANVAS_TEXT` | 开 | Canvas 文本 |
| `ENABLE_CANVAS_VIDEO` | 开 | Canvas 视频 |
| `ENABLE_CANVAS_HEIC` | 关 | HEIC 图片支持 |
| `CANVAS_SVG_IMPORT` | 开 | SVG 导入 |
| `ENABLE_SVG_PREVIEW` | 开 | SVG 代码预览 |
| `ENABLE_VIDEO_BLOCK` | 开 | 视频 block |

### 列表 / 搜索 / GraphQL

| 开关 | 默认 | 作用 |
| --- | --- | --- |
| `ENABLE_GRAPHQL_SOUP` | PostHog | Soup 数据走 GraphQL 新通道 |
| `ENABLE_GRAPHQL_BACKFILL` | 开 | GraphQL 缓存/数据回填 |
| `ENABLE_SOUP_FILTER_PERSISTENCE` | PostHog | 列表筛选条件持久化 |
| `ENABLE_UNIFIED_LIST_AI_INPUT` | 开 | 列表顶部 AI 自然语言输入 |
| `ENABLE_FEATURED_SEARCH_RESULTS` | 开 | 搜索精选结果 |
| `ENABLE_SEARCH_SERVICE` | 开 | 搜索服务 |
| `ENABLE_CREATE_PROPERTY` | 开 | 创建属性字段 |

### UI / 体验

| 开关 | 默认 | 作用 |
| --- | --- | --- |
| `ENABLE_PROFILE_PICTURES` | 开 | 用户头像图片 |
| `ENABLE_LIVE_INDICATORS` | 开 | 在线/实时编辑指示 |
| `ENABLE_ANIMATED_ICONS` | 开 | 动态图标 |
| `USE_WIDE_ICONS` | 开 | 宽版图标 |
| `ENABLE_REFOCUS_HIGHLIGHT` | 开 | 重新聚焦时高亮 |
| `ENABLE_APP_STORE_QR_CODE` | 开 | App Store 二维码 |
| `ENABLE_CALLKIT` | 开 | CallKit/通话相关入口 |
| `ENABLE_PR_DISCUSSION_INPUT` | 关 | PR 讨论输入框 |
| `USE_MACRO_PR_SUMMARY_BLOCK` | 开 | Macro PR Summary block |
| `UNIFIED_CHANNEL_INPUT` | 关 | 桌面端统一频道输入框；触屏设备默认统一输入 |
| `ENABLE_SNIPPETS` | dev 开 | 文本片段/邮件模板 |
| `ENABLE_REMINDERS` | dev 开 | 提醒功能 |
| `ENABLE_CHAT_CHANNEL_ATTACHMENT` | 开 | 频道附件上传 |
| `ENABLE_BEARER_TOKEN_AUTH` | 关 | 前端用 Bearer Token 调 API |

## PostHog-only 开关

这些开关当前没有 `env` 绑定，不能通过 `window.__MACRO_ENV__` 或 `VITE_` 覆盖。

| PostHog key | 代码常量 | 当前作用 |
| --- | --- | --- |
| `enable-home-view` | `enableHomeView` | Home 首页入口 |
| `enable-soup-group-by` | `enableSoupGroupBy` | 列表分组 |
| `enable-task-duplicates` | `enableTaskDuplicates` | 相似/重复任务检测 |
| `enable-supported-soup-foreign-entities` | `enableSupportedSoupForeignEntities` | Soup 支持外部实体 |
| `disable-auto-update-ui` | `disableAutoUpdateUi` | 禁用自动更新 UI |

自托管建议补 env 绑定：

| 建议 env | 对应 PostHog key |
| --- | --- |
| `ENABLE_HOME_VIEW` | `enable-home-view` |
| `ENABLE_SOUP_GROUP_BY` | `enable-soup-group-by` |
| `ENABLE_TASK_DUPLICATES` | `enable-task-duplicates` |
| `ENABLE_SUPPORTED_SOUP_FOREIGN_ENTITIES` | `enable-supported-soup-foreign-entities` |
| `ENABLE_AUTO_UPDATE_UI` | `disable-auto-update-ui` 的反向控制已存在，但不是普通 `defineFlag` env |

## Pipedream MCP 开关

`apps/web/src/lib/core/pipedream/flag.ts` 里还有：

| 开关 | 作用 |
| --- | --- |
| `ENABLE_PIPEDREAM_MCP` | Pipedream MCP 集成入口；env 未设置时回落 PostHog |

## 浏览器观测与开发环境变量

这些不是产品功能开关，但会影响运行行为。

| 变量 | 作用 |
| --- | --- |
| `VITE_ENABLE_BROWSER_OTEL` | 浏览器 OpenTelemetry |
| `VITE_OTEL_EXPORTER_URL` | 浏览器 OTEL 导出地址 |
| `VITE_OTEL_ENV` | OTEL 环境名 |
| `VITE_POSTHOG_API_KEY` | 启用 PostHog |
| `VITE_POSTHOG_HOST` | PostHog API host |
| `VITE_POSTHOG_UI_HOST` | PostHog UI host |
| `VITE_LOCAL_SERVERS` | 本地前端使用哪些本地服务 |
| `VITE_LOCAL_BACKEND_ORIGIN` | 本地后端入口 |
| `VITE_AI_EDITING_WORKER_URL` | AI editing worker 地址 |
| `VITE_SYNC_SERVICE_HOST` | sync-service host |
| `VITE_SYNC_SERVICE_REMOTE_HOST` | sync-service remote host |
| `VITE_ADMIN_EMAIL` | 本地/自托管管理员邮箱注入 |

## 调试、日志、链路追踪与第三方外发

结论：Macro 同时支持本地调试观测和第三方观测。不是所有日志都会发第三方；是否外发取决于 collector/profile/env。

### 前端浏览器观测

定义在 `apps/web/src/observability/browser.ts`。

| 变量 / flag | 默认 | 作用 | 是否第三方 |
| --- | --- | --- | --- |
| `VITE_ENABLE_BROWSER_OTEL=false` | 强制关 | 关闭浏览器 OpenTelemetry traces/logs | 否 |
| `VITE_ENABLE_BROWSER_OTEL=true` | 强制开 | 开启浏览器 OTEL | 取决于 `VITE_OTEL_EXPORTER_URL` |
| `VITE_OTEL_EXPORTER_URL` | 未设置 | 浏览器 OTEL 导出地址 | 取决于地址 |
| `VITE_OTEL_ENV` | `prod` / `dev` | OTEL 环境名 | 否 |
| PostHog flag `enable-browser-otel` | PostHog 控制 | 生产/非热更新环境下控制浏览器 OTEL | 会查询 PostHog |

浏览器 OTEL 默认逻辑：

1. `VITE_ENABLE_BROWSER_OTEL=false`：一定关闭。
2. `VITE_ENABLE_BROWSER_OTEL=true`：一定开启。
3. 本地热更新：只要设置了 `VITE_OTEL_EXPORTER_URL` 就开启。
4. 非本地：需要 `VITE_POSTHOG_API_KEY`，再由 PostHog flag `enable-browser-otel` 决定。

默认本地开发可走：

```text
http://localhost:8098/i/otlp/v1/traces
```

这是本地 `analytics_proxy`，不是直接把浏览器数据发给 Datadog。

### 前端产品分析

定义在 `apps/web/src/lib/analytics/analytics.ts`。

| 变量 | 作用 | 是否第三方 |
| --- | --- | --- |
| `VITE_POSTHOG_API_KEY` | 启用 PostHog、Feature Flag、产品事件、异常事件 | 是，除非通过自托管/代理改写 |
| `VITE_POSTHOG_HOST` | PostHog API host；默认 `/i/ph` | 默认走同源代理 |
| `VITE_POSTHOG_UI_HOST` | PostHog UI 地址；默认 `https://us.posthog.com` | 是 |
| `VITE_SEGMENT_WRITE_KEY` | Segment 写入 key | 是 |

当前 PostHog 初始化默认 `api_host` 是 `/i/ph`，也就是先打到本应用同源路径；真正是否出网取决于后面的 `analytics_proxy` / 反代配置。

### analytics_proxy

本地和自托管里都有 `analytics_proxy` 服务。

| 服务 | 作用 | 是否第三方 |
| --- | --- | --- |
| `analytics_proxy` `/i/ph/*` | 代理 PostHog | 是，默认上游 `https://us.i.posthog.com` |
| `analytics_proxy` `/i/otlp/*` | 代理 OTLP traces/logs | 取决于后端 collector |

本地 `docker/docker-compose.yml` 注释明确说明：`analytics_proxy` 是第一方代理，目的是让浏览器不持有 Datadog key，并减少广告拦截影响。

### 本地链路追踪 collector

本地 Docker Compose 支持三种 profile。

| profile / 服务 | 作用 | 是否第三方 |
| --- | --- | --- |
| `lgtm` | Grafana + Tempo traces + Loki logs + Prometheus metrics，本地 UI `http://localhost:3001` | 否 |
| `jaeger` | 本地 Jaeger traces UI `http://localhost:16686` | 否 |
| `datadog-agent` | 本地收 OTLP，再转发 Datadog us5 | 是 |

结论：

- 要完全本地调试：用 `lgtm` 或 `jaeger`。
- 要发 Datadog：显式跑 `datadog-agent` profile，并提供 `DD_API_KEY`。

### 后端 Rust 日志与 traces

核心入口在 `crates/macro_entrypoint/src/lib.rs`。

| 变量 | 作用 | 是否第三方 |
| --- | --- | --- |
| `RUST_LOG` | 控制 Rust tracing 日志级别，例如 `info`、`debug`、`service=trace` | 否，本地 stdout/stderr；若配置 OTEL logs collector 才可能转发 |
| `OTEL_TRACE_FILTER` | 单独控制 OpenTelemetry span 过滤，不受 `RUST_LOG=warn` 影响 | 取决于 OTEL exporter |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | 后端 OTLP exporter 地址 | 取决于地址 |
| `DD_ENV` | Datadog/部署环境名 | 仅 Datadog 路径使用 |
| `DD_API_KEY` | Datadog agent / infra 使用 | 是 |

本地逻辑：

- 不设置 `OTEL_EXPORTER_OTLP_ENDPOINT`：只本地控制台日志。
- 设置到本地 `otel-collector:4318`：发本地 LGTM/Jaeger/Datadog agent。
- collector 是 LGTM/Jaeger：不出第三方。
- collector 是 Datadog agent：会出第三方 Datadog。

生产/Develop 逻辑：

- `macro_entrypoint` 会初始化 OpenTelemetry。
- Datadog 相关 IaC 在 `infra/**` 中使用 `DATADOG_API_KEY`、Firehose、Datadog agent 配置。

### 常用后端调试例子

| 命令 / 变量 | 作用 |
| --- | --- |
| `RUST_LOG=info` | 默认信息日志 |
| `RUST_LOG=debug` | 全局 debug |
| `RUST_LOG=email_service=debug,info` | 只提高 email_service 详细度 |
| `RUST_LOG=document_cognition_service=trace,ai=trace,ai_tools=debug,anthropic=debug,info` | 文档认知 / AI 工具深度调试 |
| `RUST_LOG=agent_session=trace` | Agent session 线级别调试 |
| `RUST_LOG=webhook=trace` | Webhook 收发调试 |
| `RUST_LOG=analytics_client=debug` | Meta/analytics 匹配质量调试 |

### Worker / Cloudflare 服务 OTEL

| 文件 | 变量 | 作用 |
| --- | --- | --- |
| `services/sync-service/wrangler.toml` | `OTEL_EXPORTER_OTLP_ENDPOINT` | sync-service OTEL |
| `services/ai-editing-worker/wrangler.toml` | `OTEL_EXPORTER_OTLP_ENDPOINT` | AI editing worker OTEL |

这些文件里 dev/prod 默认有 `macro-prox-*.macroverse.workers.dev/i/otlp`，属于官方代理路径。私有化生产要避免依赖官方代理，应改成本地/自托管 collector 或关闭。

### 其它前端调试开关

| 开关 | 作用 |
| --- | --- |
| `window.__MACRO_TRANSLATION_DEBUG__ = true` | 打开邮件/文本翻译规划的 `console.debug('[Translation Planner]', ...)` |
| `macro:debug-settings.force-empty-states` | 强制空状态 UI |
| `ENABLE_TTFT` | 显示 AI 首 token 延迟 |

### 是否发送到第三方

| 类型 | 默认路径 | 是否第三方 |
| --- | --- | --- |
| 浏览器 console 日志 | 浏览器本地 DevTools | 否 |
| Rust `RUST_LOG` | 容器 stdout/stderr / `docker compose logs` | 否 |
| 本地 `lgtm` traces/logs | 本机 Grafana/Tempo/Loki | 否 |
| 本地 `jaeger` traces | 本机 Jaeger | 否 |
| `datadog-agent` profile | Datadog us5 | 是 |
| PostHog analytics | `/i/ph` 代理到 PostHog | 是，除非改成自托管/禁用 |
| Segment / Meta Pixel | 第三方 | 是 |
| `macro-prox-*.macroverse.workers.dev/i/otlp` | Macro 官方代理 | 是，私有化应避免 |

## 后端队列与服务开关

代码注释和本地 e2e compose 中出现的运行时开关：

| 变量 | 作用 |
| --- | --- |
| `ENABLE_EMAIL_SCHEDULED_QUEUE` | 邮件定时发送队列 |
| `ENABLE_GMAIL_OPS_QUEUE` | Gmail 操作队列；关闭会影响线程标签等同步操作 |
| `ENABLE_NOTIFICATION_QUEUE` | 通知队列；关闭会影响推送清理 |

这些属于后端运行时能力，不是前端 UI flag。

## 健康检查、就绪探针与运维检查

结论：官方仓库的健康检查主要在 `docker/docker-compose.yml` 和 `tooling/xtask/crates/xtask_local/src/local/*`。`self-host/`、`doctor.py`、`check-drift.py`、`localstack_reconciler` 是本 fork 的自托管二开，不属于 `macro-inc/macro` 上游原生健康检查。

### 官方上游健康检查来源

已对比 `upstream/main`：

| 来源 | 上游是否存在 | 作用 |
| --- | --- |
| `docker/docker-compose.yml` | 是 | 本地 Docker 服务 healthcheck |
| `tooling/xtask/crates/xtask_local/src/local/doctor.rs` | 是 | `doctor-local` 预检 |
| `tooling/xtask/crates/xtask_local/src/local/status.rs` | 是 | `status-local` 状态输出 |
| `tooling/xtask/crates/xtask_local/src/local/stack.rs` | 是 | `stack status` / backend health |
| `tooling/xtask/crates/xtask_local/src/local/frontend.rs` | 是 | 前端等待 backend ready |
| `self-host/*` | 否 | 本 fork 自托管二开 |

### 官方上游 Docker Compose healthcheck

定义在上游 `docker/docker-compose.yml`。

| 服务 | 健康检查 |
| --- | --- |
| `authentication-service` | `http://localhost:8080/health` |
| `connection_gateway` | `http://localhost:8080/health` |
| `contacts_service` | `http://localhost:8080/health` |
| `document_cognition_service` | `http://localhost:8080/health` |
| `document_storage_service` | `http://localhost:8080/health` |
| `email_service` | `http://localhost:8080/health` |
| `notification_service` | `http://localhost:8080/health` |
| `scheduled_action_service` | `http://localhost:8080/health` |
| `search_processing_service` | `http://localhost:8080/health` |
| `static_file_service` | `http://localhost:8080/api/health` |
| `unfurl_service` | `http://localhost:8080/health` |
| `image_proxy_service` | `http://localhost:8080/health` |
| `sync_service` | `http://localhost:8787/health` |
| `lexical_service` | `http://localhost:8096/health` |

官方本地 compose 中没有看到 Postgres / Redis / OpenSearch / LocalStack / FusionAuth 这类基础设施容器 healthcheck；这些检查出现在本 fork 的 `self-host/docker-compose.yml` 里。

### 官方上游本地健康检查命令

| 命令 | 作用 |
| --- | --- |
| `just doctor-local` | 本地环境预检：Docker daemon、docker compose、cargo-zigbuild、sccache、cmake、bun、sqlx-cli、Rust target、端口、Docker Desktop 端口转发 |
| `just status_local` | 查看当前本地实例容器状态、健康状态和 URL |
| `just stack status` | headless stack 状态，含 backend health |

官方本地前端等待后端使用：

```text
/auth/health
```

对应逻辑在 `tooling/xtask/crates/xtask_local/src/local/frontend.rs`。

`just stack status` 也会探测：

```text
/auth/health
```

并输出 `backend_healthy`。

### 本 fork 自托管扩展健康检查

以下不是官方上游原生能力，是本 fork 为自托管生产增加的检查。

#### self-host Compose 模板

定义在 `self-host/docker-compose.yml`：

| 配置 | 值 |
| --- | --- |
| `interval` | `30s` |
| `timeout` | `10s` |
| `retries` | `3` |
| `start_period` | `30s` |

#### self-host 基础设施检查

| 服务 | 健康检查 |
| --- | --- |
| `postgres` | `pg_isready -U ${POSTGRES_USER:-macro} -d ${POSTGRES_DB:-macrodb}` |
| `redis` | `redis-cli ping` |
| `opensearch` | `/_cluster/health`，允许 `green/yellow` |
| `localstack` | `/_localstack/health` |
| `localstack_reconciler` | `/tmp/localstack-ready` 文件存在 |
| `fusionauth_db` | `pg_isready -U ${FUSIONAUTH_DB_USER:-postgres}` |
| `fusionauth` | `/api/status` 返回 `"status":"Ok"` |

`localstack_reconciler` 持续观察 LocalStack 健康状态，并在恢复后重新执行 `localstack_provision`，避免 SQS/S3/DynamoDB/KMS 资源漂移。

#### self-host 业务级 Doctor

脚本：`self-host/scripts/doctor.py`。这是本 fork 文件，上游 `upstream/main` 不存在。

它不只是看容器是否 healthy，还检查业务合同：

| 检查项 | 内容 |
| --- | --- |
| LocalStack | `/_localstack/health` |
| SQS | 队列数量，要求至少约 20 个 |
| S3 | bucket 数量，要求至少约 5 个 |
| FusionAuth IdP | 必须有 `google` 和 `google_gmail` |
| MacroDB 用户一致性 | `"User".macro_user_id` 必须能关联 `macro_user.id` |
| Gmail inbox | `email_links.is_sync_active`、`needs_reauth` |
| 容器状态 | `docker ps` 中不能有 `unhealthy` / `Restarting` |

运行：

```text
python3 self-host/scripts/doctor.py
```

#### self-host 构建/配置漂移检查

脚本：`self-host/scripts/check-drift.py`。这是本 fork 文件，上游 `upstream/main` 不存在。

作用：防止 self-host 静态产物落后于 Rust 源码中的服务清单和资源清单。

重点检查：

| 检查项 | 内容 |
| --- | --- |
| 服务清单 | `docker-compose.yml` 必须包含 inventory 中要求的服务二进制 |
| Caddy 路由 | 服务 `path_prefix` 必须进 `self-host/Caddyfile` |
| LocalStack provision | 必须使用 `localstack_provision --url` |
| LocalStack reconciler | 必须存在 sidecar，并挂载 `reconcile-localstack.sh` |
| Email profile | `cognition/scheduledActions/agents/docsCollab` 必须默认 false |
| Optional profile | cognition、scheduled actions、ai editing 等必须保持 opt-in |
| Kafka topics | self-host topics 必须覆盖 email 所需 topics，且不能 invent 上游没有的 topic |
| FusionAuth IdP | Google / google_gmail 模板和 reconcile lambda 必须存在 |

运行：

```text
python3 self-host/scripts/check-drift.py
```

### 健康检查是否外发第三方

| 类型 | 是否外发 |
| --- | --- |
| Docker `healthcheck` | 否，容器内部本地请求 |
| `/health` / `/api/health` | 否，服务本地 HTTP |
| `doctor-local/status-local` | 否，本机 Docker / curl 检查 |
| `self-host/scripts/doctor.py` | 否，检查本机容器、数据库、LocalStack |
| `check-drift.py` | 否，静态文件和源码一致性检查 |
| FusionAuth `/api/status` | 否，容器内/内网请求 |
| Gmail inbox `needs_reauth` 检查 | 否，只查本地 MacroDB |

注意：健康检查本身不发第三方；但它可能检查“第三方配置是否存在”，比如 Google/Gmail IdP 是否配置好。

## 真实 RBAC 角色

定义在 `crates/roles_and_permissions/src/domain/model.rs`。

| RoleId | 作用 |
| --- | --- |
| `professional_subscriber` | 专业版订阅用户 |
| `team_subscriber` | 团队订阅用户 |
| `corporate` | 企业/线下协议授权用户 |
| `partner_sales` | 合作销售 |
| `self_serve` | 自助管理 Stripe 订阅 |
| `super_admin` | Macro 内部超级管理员 |
| `online_subscriber` | 在线订阅用户 |
| `organization_it` | 组织 IT 管理员 |
| `manage_organization_subscription` | 管理组织订阅 |
| `email_tool` | 邮件工具权限 |
| `email_tool_on_prem` | 私有部署邮件工具权限 |
| `ai_subscriber` | AI 功能订阅 |
| `editor_user` | 编辑器功能用户 |
| `sub_haiku` | Haiku 套餐 |
| `sub_sonnet` | Sonnet 套餐 |
| `sub_opus` | Opus 套餐 |

付费角色判断包括：

- `professional_subscriber`
- `team_subscriber`
- `corporate`
- `sub_haiku`
- `sub_sonnet`
- `sub_opus`

## 真实 RBAC 权限

前端常量在 `apps/web/src/lib/core/constant/permissions.ts`，后端枚举在 `crates/roles_and_permissions/src/domain/model.rs`。

| PermissionId | 作用 |
| --- | --- |
| `write:stripe_subscription` | 修改/创建 Stripe 订阅 |
| `read:professional_features` | 使用 premium/paywalled 客户端功能 |
| `write:release_email` | 发送 release 通知邮件 |
| `write:admin_panel` | Admin 面板修改权限 |
| `write:enterprise_subscriptions` | 企业订阅管理 |
| `write:discount` | 生成折扣 |
| `write:it_panel` | 组织 IT 面板 |
| `write:email_tool` | 邮件工具 |
| `write:ai_features` | Macro AI 功能 |
| `read:docx_editor` | Docx/editor 功能 |
| `write:proai` | 专业付费 AI 模型 |

重点：

- `read:professional_features` 是专业版功能核心权限。
- `write:proai` 是付费高级 AI 模型核心权限。
- `licenseStatus === active/trialing` 会被前端 analytics 识别为 `premium`，但功能授权仍应看 RBAC 权限。

## self-host 当前 PERM_* 映射

`self-host/docker-compose.yml` 生成 `window.__MACRO_ENV__.PERMISSIONS`：

| env | runtime key | 说明 |
| --- | --- | --- |
| `PERM_ALL_ACCESS` | `allAccess` | 全特权总开关 |
| `PERM_SUPER_ADMIN` | `superAdmin` | 超级管理员 |
| `PERM_CORPORATE` | `corporate` | 企业授权 |
| `PERM_PRO_LICENSE` | `proLicense` | 专业版许可证 |
| `PERM_SUB_OPUS` | `subOpus` | Opus 套餐 |
| `PERM_AI_SUBSCRIBER` | `aiSubscriber` | AI 订阅 |
| `PERM_EDITOR_USER` | `editorUser` | 编辑器用户 |
| `PERM_ORGANIZATION_IT` | `organizationIt` | 组织 IT |
| `PERM_EMAIL_TOOL` | `emailTool` | 邮件工具 |

注意：当前前端主要读的是 `user.permissions`、`licenseStatus` 和 feature flags；`window.__MACRO_ENV__.PERMISSIONS` 是自托管二开层，需要确认具体消费点后才能等同于后端 RBAC。

## 本地 Debug 开关

定义在 `apps/web/src/lib/debugSettings.ts`。

| localStorage key | 子 key | 作用 |
| --- | --- | --- |
| `macro:debug-settings` | `force-empty-states` | 强制 sidebar/nav 进入空状态，用于 UI 空状态调试 |

## 文档级分享权限

这不是付费权限，是实体访问权限：

| 权限 | 作用 |
| --- | --- |
| `Owner` | 所有者 |
| `Can Edit` | 可编辑 |
| `Can Comment` | 可评论 |
| `Can View` | 可查看 |
| `No Access` | 无访问 |

对应文件：`apps/web/src/lib/core/component/SharePermissions.tsx`。

## 自托管建议

推荐做三件事：

1. 把 PostHog-only 开关补齐 env 绑定，尤其是 `ENABLE_HOME_VIEW`、`ENABLE_SOUP_GROUP_BY`、`ENABLE_TASK_DUPLICATES`。
2. 区分 feature flag 和 RBAC：UI 入口可以靠 feature flag，真正授权要靠后端角色/权限。
3. 不要只在 `window.__MACRO_ENV__.PERMISSIONS` 里声明权限；如果后端接口校验 RBAC，还需要数据库角色/权限同步。
