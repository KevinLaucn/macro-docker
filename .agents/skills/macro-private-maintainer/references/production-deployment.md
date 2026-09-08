# 生产环境部署与运维架构规范 (Production Deployment & Operations Spec)

## 0. 当前生产环境默认入口

- **默认生产主机**：腾讯云 SG 2H8G，SSH 别名 `marc-sg-2h8g`。
- **生产主路径**：`/home/ubuntu/marco/`。
- **默认操作规则**：凡用户说“生产环境”“线上”“部署”“生产 Docker Compose”“生产日志/容器”且未指定其它主机时，直接连接 `marc-sg-2h8g`，并在 `/home/ubuntu/marco/` 下操作。
- **历史环境状态**：飞牛 OS 与美国 VPS 均视为历史/备用环境；只有用户明确提到 `fnOS`、飞牛、美国 VPS、`tencent-us2h8g`、旧 VPS 或指定对应主机时才连接。

## 1. 生产环境拓扑

- **容器化引擎**：Docker Compose，统一编排 Web 前端、核心 Rust 服务集群、PostgreSQL、Redis、OpenSearch 等。
- **反向代理与 SSL**：基于 1Panel / OpenResty 或 Nginx 托管，负责公网 SSL 终结、请求限流与反向代理路由。
- **配置分离**：业务配置和敏感环境变量落盘于生产主路径下的 `.env`，模板见 `self-host/.env.example`。

## 2. 生产镜像发布与 Profile 体系

- **Full Profile**：
  - 服务镜像：`ghcr.io/kevinlaucn/macro-services:$VERSION`
  - 数据库迁移镜像：`ghcr.io/kevinlaucn/macro-init:$VERSION`
- **Email Profile（生产推荐精简闭包）**：
  - 服务镜像：`ghcr.io/kevinlaucn/macro-services-email:$VERSION`
  - 数据库迁移镜像：`ghcr.io/kevinlaucn/macro-init-email:$VERSION`
- **构建原则**：生产主机禁止承担任何高负载编译任务，镜像统一由独立专用编译机或 GitHub Actions 预构建发布后 pull 拉取。

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
