# Macro 生产环境私有化部署指南 (Production Self-Hosted Runbook)

基于 `KevinLaucn/macro` 生产分支，该部署架构以完全自托管、避免依赖 Macro 官方 Cloud SaaS 为目标。

---

## 1. 架构与端口说明

- **公网单一入口**：通过 **Caddy** 容器监听 `80` (HTTP) 与 `443` (HTTPS) 端口。
- **端口安全规范**：后端数据库（PostgreSQL、Redis、OpenSearch、Kafka、LocalStack、FusionAuth DB）以及 16 个 Rust 微服务均不暴露公网端口（全部运行在内部 Docker bridge 网络 `services`、`databases`、`auth`、`auth-internal` 中）。
- **静态资源与反向代理**：
  - `/app/*` -> 前端 Web 静态资源（HTML 与 `env-config.js` 配置 `no-cache`，内容哈希静态资源配置 1 年 `immutable` 缓存）。
  - `/_healthz` -> Caddy 反向代理网关健康检查端点。
  - `/auth/*`、`/email/*`、`/contacts/*`、`/dss/*`、`/connection-gateway/*`、`/websocket/*`、`/sync/*` 等 -> Caddy 自动路由至内部微服务。

---

## 2. 域名与 DNS 解析要求

在 VPS 启动前，必须在 DNS 解析服务商处将以下 **三个域名**（以 A 记录或 CNAME）全部解析至该 VPS 的公网 IP：

| 域名变量 | 说明 | 示例 |
|---|---|---|
| `MACRO_DOMAIN` | Web 应用与统一 API 入口 | `mail.example.com` |
| `S3_DOMAIN` | 对象存储端点（必须独立，用于浏览器 SigV4 预签名 URL 直传/下载） | `s3.example.com` |
| `FUSIONAUTH_DOMAIN` | 身份认证服务独立域名（供 OAuth SSO 重定向使用） | `auth.example.com` |

---

## 3. Google OAuth & Gmail API 配置规范

若需启用 Google 登录与 Gmail 邮箱数据同步，必须在 [Google Cloud Console](https://console.cloud.google.com/) 的「OAuth 同意屏幕」与「凭据 (Credentials)」中创建 OAuth 2.0 Web Client，并配置以下重定向 URI：

### 3.1 授权重定向 URI (Authorized Redirect URIs)
必须在 Google Cloud Console 中填入：
1. `https://${MACRO_DOMAIN}/auth/oauth/redirect`
2. `https://${FUSIONAUTH_DOMAIN}/oauth2/callback`

### 3.2 环境变量项
在 `.env` 中填入：
```bash
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET_KEY=your-google-client-secret
```

---

## 4. 镜像说明与 GHCR 配置

所有 Macro 自研服务镜像均由 GitHub Actions 自动化流水线推送到 GitHub Container Registry (GHCR)。

- **前端镜像**：`${MACRO_IMAGE_WEB:-ghcr.io/kevinlaucn/macro-web}:${MACRO_VERSION}`
- **微服务核心镜像**：`${MACRO_IMAGE_SERVICES:-ghcr.io/kevinlaucn/macro-services}:${MACRO_VERSION}`
- **初始化/数据迁移镜像**：`${MACRO_IMAGE_INIT:-ghcr.io/kevinlaucn/macro-init}:${MACRO_VERSION}`
- **辅助 Worker 镜像**：
  - `ghcr.io/kevinlaucn/macro-sync-service:${MACRO_VERSION}`
  - `ghcr.io/kevinlaucn/macro-lexical-service:${MACRO_VERSION}`
  - `ghcr.io/kevinlaucn/macro-ai-editing-worker:${MACRO_VERSION}`
  - `ghcr.io/kevinlaucn/macro-websocket-service:${MACRO_VERSION}`
  - `ghcr.io/kevinlaucn/macro-analytics-proxy:${MACRO_VERSION}`

> **版本规范（强制）**：生产环境必须 pin 确切的版本 tag（例如当前 UI 测试 tag `MACRO_VERSION=test-2ae8c8320` 或正式 release tag `MACRO_VERSION=v2.5.1`），**严禁在生产环境中使用 `MACRO_VERSION=latest`**。

---

## 5. VPS 部署操作步骤

生产环境默认使用 `/opt/macro/current`，其目标是完整的 CI release bundle：
`/opt/macro/releases/<git-sha>/`。`/etc/macro/macro.env` 是跨 Release 唯一复用的
运行时环境文件；生产机不执行 Git pull、cargo build，也不维护散落的应用配置。

### 第一步：准备部署目录与文件
```bash
sudo mkdir -p /opt/macro/releases /etc/macro
# 解压 CI 生成的完整 bundle 到 /opt/macro/releases/<git-sha>/
sudo ln -sfn /opt/macro/releases/<git-sha> /opt/macro/current
cd /opt/macro/current
```

### 第二步：生成强密钥与环境配置
运行内置的强随机密钥生成器（会自动生成 `.env`，包含强随机密钥、数据库密码并要求设置明确的 `MACRO_VERSION`）：
```bash
./macroctl generate-secrets \
  --domain mail.example.com \
  --acme-email admin@example.com \
  --smtp-host smtp.example.com \
  --smtp-port 587 \
  --smtp-user your-smtp-username \
  --smtp-pass your-smtp-password \
  --admin-email admin@example.com \
  --macro-version test-2ae8c8320
```
> **说明**：生产环境严禁使用 `latest`。若需自定义环境变量，可参考仓库中的 `self-host/.env.example`。

### 第三步：登录 GHCR 镜像仓库
```bash
echo $GHCR_TOKEN | docker login ghcr.io -u kevinlaucn --password-stdin
```

### 第四步：初始化配置与镜像拉取
```bash
./macroctl init
./macroctl pull
```

### 第五步：启动全量生产服务
```bash
./macroctl up
```

---

## 6. Web UI 单独验证模式 (Smoke Test)

在后端微服务或数据库尚未就绪，或者仅需要快速测试 Caddy、SSL 证书与前端静态页面加载性能时，可使用独立的 UI 验证模式：

```bash
cd /opt/macro/current
docker compose --env-file /etc/macro/macro.env -f docker-compose.yml up -d caddy
```
> **原理**：Caddy 服务自身已声明依赖 `web_assets`（`condition: service_completed_successfully`），Compose 会自动先执行 `web_assets` 容器将前端静态资源解包到共享卷，然后再拉起 Caddy。

启动后在浏览器访问：
`https://${MACRO_DOMAIN}/app/`
即可直接验证静态前端 HTML、JS、CSS、WASM 的加载与 Caddy TLS 证书颁发。

---

## 7. 日常运维命令

- **查看服务运行状态**：
  ```bash
  ./macroctl status
  ```
- **查看服务日志**：
  ```bash
  ./macroctl logs [service_name]
  ```
- **拉取镜像**：
  ```bash
  ./macroctl pull
  ```
- **重启服务**：
  ```bash
  ./macroctl restart [service_name]
  ```
- **版本平滑升级**（自动备份、拉取新版本、执行数据迁移并重建容器）：
  ```bash
./macroctl upgrade /path/to/macro-release-bundle
  ```
- **完整备份数据**（含 PostgreSQL、FusionAuth 库及 LocalStack 对象存储快照）：
  ```bash
  ./macroctl backup
  ```
- **停止服务**（保留所有持久化 Volume）：
  ```bash
  ./macroctl down
  ```
