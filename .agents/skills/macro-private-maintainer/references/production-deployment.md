# 生产环境部署与运维架构规范 (Production Deployment & Operations Spec)

## 0. 当前生产环境默认入口

- **默认生产主机**：腾讯云 SG 2H8G，SSH 别名 `marc-sg-2h8g`。
- **生产主路径**：`/home/ubuntu/marco/`。
- **默认操作规则**：凡用户说“生产环境”“线上”“部署”“生产 Docker Compose”“生产日志/容器”且未指定其它主机时，直接连接 `marc-sg-2h8g`，并在 `/home/ubuntu/marco/` 下操作。
- **历史环境状态**：飞牛 OS 与美国 VPS 均视为历史/备用环境；只有用户明确提到 `fnOS`、飞牛、美国 VPS、`tencent-us2h8g`、旧 VPS 或指定对应主机时才连接。

## 1. 生产环境拓扑

- **容器化引擎**：Docker Compose，统一编排 Web 前端、核心 Rust 服务集群、PostgreSQL、Redis、OpenSearch 等。
- **服务合并与路由契约**：
  - `agent_harness_service` 已合并承载 `document_cognition_service`（`/cognition`）、`scheduled_action_service`（`/scheduled-action`）、`preview`（`/preview`）及 `public_mcp`（`/mcp`）。
  - Caddy 对 `/cognition`、`/scheduled-action`、`/preview`、`/mcp` 必须使用不剥离前缀的 `handle`（匹配裸路径与 `/*` 子路径），对 `/agent-harness/*` 使用 `handle_path`。
  - 生产环境 `agent_harness_service` 保持常驻（无 `agents` profile 门控），强制 `DEV_DANGEROUS_LOCAL_CONTAINERS=false`、非 `root` 运行且禁止挂载宿主机 `/var/run/docker.sock`。
  - 合并服务通过 `auth` 网络访问 FusionAuth；`MCP_OAUTH_KMS_KEY_ID` 使用原生目录创建的 `alias/macro-local-mcp-oauth`。沿用 `ENVIRONMENT=local` 的本地凭据模式时，预览使用 `preview.localhost`；不得误用应用子域名或将本地配置宣称为可用的外网预览。
  - `/calendar/*` 路由由独立的 `calendar_service` 容器承载（不再由 `email_service` 承载）。
- **反向代理与 SSL**：基于 1Panel / OpenResty 或 Nginx / Caddy 托管，负责公网 SSL 终结、请求限流与反向代理路由。
- **配置分离**：业务配置和敏感环境变量落盘于生产主路径下的 `.env`，模板见 `self-host/.env.example`。

## 2. 生产镜像发布与 Profile 体系

- **Full Profile**：
  - 服务镜像：`ghcr.io/kevinlaucn/macro-services:$VERSION`
  - 数据库迁移镜像：`ghcr.io/kevinlaucn/macro-init:$VERSION`
- **Email Profile（生产推荐精简闭包）**：
  - 服务镜像：`ghcr.io/kevinlaucn/macro-services-email:$VERSION`
  - 数据库迁移镜像：`ghcr.io/kevinlaucn/macro-init-email:$VERSION`
- **构建原则**：生产主机禁止承担任何高负载编译任务，镜像统一由独立专用编译机或 GitHub Actions 预构建发布后 pull 拉取。
- **独立发布包校验**：`verify-release.py` 必须读取当前发布包自带的 `.env.example`，不得依赖生产机存在源码 checkout。
- **生产诊断配置**：`doctor.py` 优先读取 `MACRO_SHARED_ENV_FILE`，默认 `/etc/macro/macro.env`，不要求发布目录另放 `.env`。

## 3. 运维标准指令范式 (命令模板)

- **容器状态核查**：`ssh marc-sg-2h8g "docker ps -a"`
- **服务健康与实时日志**：`ssh marc-sg-2h8g "docker logs --tail 100 <service_name>"`
- **单服务优雅更新**：`ssh marc-sg-2h8g "cd /home/ubuntu/marco && docker compose pull <service_name> && docker compose up -d --force-recreate <service_name>"`
- **真实连接凭据**：详细主机 IP、端口与专用 SSH 密钥路径请直接查阅被本地 `.gitignore` 保护的 `.agents/skills/macro-private-maintainer/.local-production.md`。

## 4. 单用户/低资源生产环境推荐基线与排障规范 (Personal Self-Host Profile)

针对腾讯云 SG 2H8G、2C8G / 2C4G 等轻量自托管主机，生产环境已对默认高并发企业级资源配置进行了深度精简调优，收敛至高度确定且安全稳健的生产形态：

| 服务组件 | 推荐配置 | 稳态物理内存 | 定位与架构特性 |
| :--- | :--- | :---: | :--- |
| **Kafka** | `KAFKA_HEAP_OPTS=-Xms256m -Xmx512m` | ~450–500 MiB | ✅ 单用户低负载下兼顾内存与突发余量 |
| **OpenSearch** | `OPENSEARCH_JAVA_OPTS=-Xms384m -Xmx384m` | ~780–850 MiB | 🎯 Xms=Xmx，降低堆动态扩缩容，适合单用户轻量索引 |
| **LocalStack** | `mem_limit: 750m` + `DYNAMODB_HEAP_SIZE: 64m` | ~540–650 MiB | ✅ 当前实测合理，守住上限防止闲置缓存膨胀 |
| **FusionAuth** | `FUSIONAUTH_APP_MEMORY=512M` + `SEARCH_TYPE=database` | ~620 MiB | ✅ 官方基线，无需独立 ES 搜索 |
| **Rust 微服务** | 13 个微服务原生二进制运行 | ~208 MiB | ✅ 极致轻量高效，无需额外调优 |
| **整套 Macro** | **全栈 21 容器协同** | **~2.9–3.1 GiB 稳态** | 🏆 **个人自托管黄金平衡点** |

### 故障排查与突发任务注意事项

在排查生产环境 Crash / 500 / 消息延迟 / 上传失败等故障时，必须注意：
1. **OpenSearch 突发任务**：在发生首次 Gmail 全量同步、后台 Segment Merge、索引重建（Reindex）或大批量附件索引时，堆外内存可能出现瞬时尖峰。若排查到搜索 500 或 `circuit_breaking_exception`，检查 `docker logs --tail 100 macro-selfhost-opensearch-1`。
2. **Kafka 消费者积压**：服务重启或历史数据大量 backfill 时，若发生消息积压，需观察 Broker GC 停顿与消费者组心跳（`docker logs --tail 100 macro-selfhost-kafka-1`）。
3. **LocalStack 上限监控**：大批量附件并发上传 S3 时，观察 LocalStack 是否逼近 750M 保护上限（`docker stats macro-selfhost-localstack-1`）。
4. **禁止过度再压**：坚决不再进行 `Kafka 256M / OpenSearch 256M / FusionAuth 256M / LocalStack 600M` 等极限挤压操作，避免用稳定性换取微小的边际收益。

### LocalStack SQS 持久化

`reconcile-localstack.sh` 同时绑定 `static-file-storage` 的 ObjectCreated 事件到
`static-file-s3-event-notification-queue`；上传验收必须检查元数据 `is_uploaded=true`，
仅验证 S3 PUT/GET 成功无法证明上传通知正常。

`gresau/localstack-persist:4.14.0` 在队列并发变化时可能报
`RuntimeError: dictionary changed size during iteration`，健康检查通过不能证明队列落盘成功。
Compose 挂载 `init/localstack-jsonpickle-snapshot.sh`，启动时将 jsonpickle 的字典遍历改为快照，
并先写临时文件、同步后原子替换，避免服务中断时覆盖上一份完整快照；保留原有持久化格式。
升级镜像修复这两个问题后移除此 hook，并复核队列恢复。

热修复前备份 SQS 持久化文件，短暂停止队列客户端写入；确认保存成功后再重启 LocalStack。
重启前后核对全部队列及可见、处理中、延迟消息总数，并确认持久化文件继续更新且没有保存错误。
用镜像虚拟环境运行 `scripts/test_localstack_persistence.py` 验证并发遍历和序列化引用一致性。

### 历史已读回执字段的迁移兼容

生产库若已手工添加 `email_settings.read_receipts_enabled`，执行
`20261022224928_email_read_receipts.sql` 前先备份设置并检查列依赖，临时改名保留原列，
再让原生 SQLx 迁移创建正式列及回执表；在同一事务内回填原设置、验证逐行相等、
保留原默认值并删除影子列。不得跳过迁移、修改 checksum 或使用 `CASCADE`。
