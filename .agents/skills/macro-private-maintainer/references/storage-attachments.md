# 存储与邮件附件策略规范 (Storage & Attachments Architecture Spec)

## 1. 附件生命周期与获取策略

邮件附件处理不应粗暴一刀切，必须按使用场景区分策略：

1. **前端查看 / 交互**：
   - 优先采用 Gmail API Lazy Fetch 机制，前端需要预览或下载附件时，由 `email_service` 通过用户授权 token 按需直连 Gmail 拉取并透传给前端，避免本地存储无节制膨胀。
2. **全文检索与 AI 分析**：
   - 若系统启用了 OpenSearch 历史全文检索、PDF 文本解析或本地附件索引，保留 Macro 官方 local file ingestion 与 pipeline 处理逻辑。
   - 不得未经调用链分析直接物理移除 storage pipeline。

## 2. 对象存储适配原则

### 附件可用性保护

- 保留现有逻辑：普通附件先查缓存，缺失时通过所属邮箱的官方 API 获取；文档附件保留 S3 对象检查，缺失后复用原上传流程。不另建回源框架、重试控制器或转换替代功能。
- CID/SFS 正文图片目前直接读取静态文件，不能把普通附件接口的回源能力当作正文图片已具备自动自愈。本次历史图片故障通过恢复旧存储对象解决。
- 更换 LocalStack 持久化目录或存储卷前，备份并核对数据库附件映射与实际 S3 对象；更新后抽查历史图片、文档、原件下载。不能只根据 uploaded 状态判定文件可用。
- 恢复历史对象只补缺失键，校验文件大小和校验和，不覆盖已有对象、不清空数据库或存储卷。
- `EMAIL-ATTACHMENT-RECOVERY-001` 监控附件调用者、接口、存储和部署依赖。合并命中这些路径时执行 `just test-email-attachment-recovery`；结构检查失败必须人工复核调用链，不能删断言绕过。
- 仅新增保护规则时使用 Ruby 结构回归检查，不启动完整前端/Rust 构建。这些检查不能代替运行时验证；实际改业务代码时再执行受影响范围测试。

- **接口抽象**：底层统一走 Macro Hexagonal Storage Port（`document_storage_service` / `static_file_service`）。
- **后端适配**：
  - 本地开发：可使用 LocalStack S3 或 MinIO 模拟 S3。
  - 生产环境：支持本地 MinIO、标准 AWS S3 或兼容 S3 协议的自建对象存储。
- **直传网关**：大附件通过 presigned URL 或 `static_file_service` 直接传输，避免主 API 进程承受过载流量。
