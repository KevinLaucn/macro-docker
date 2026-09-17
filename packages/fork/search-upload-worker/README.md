# Search Upload Worker (Self-host Local SQS Consumer)

## 背景

Macro 官方在 AWS 生产环境中使用 S3 EventBridge -> Lambda (`services/search_upload_handler`) 消费文档上传事件，并向 `document_storage_service` (`POST /internal/documents/{id}/content-uploaded`) 派发文档索引事件，由 DSS 投递至 Kafka / `search_event_queue` 触发 `search_processing_service` 入库 OpenSearch。

自建（Self-host / LocalStack）环境不具备 AWS EventBridge -> Lambda 拓扑。本模块作为独立的私有二开 Worker：
1. 消费 LocalStack SQS `search-upload-queue` 中的 S3 `ObjectCreated` 通知；
2. 过滤非文档 Key 并向 DSS 广播 `content-uploaded` 事件；
3. 确保自建环境下新上传的 PDF、Word 等文档能够全自动、零延迟地建立 OpenSearch 搜索索引。

## Upstream Parity Source

官方语义参考源：`services/search_upload_handler/src/handler.rs`

本 Worker 完全位于 `packages/fork/**`，不与 upstream 代码共享实现，以维持 upstream 源码 0 diff。但在业务逻辑上必须严格与官方保持以下语义一致：

- **DocumentKey parsing**: S3 Object Key 解析规则一致。
- **temp key skip**: 忽略临时上传 key（如以 `temp/` 开头）。
- **BOM part skip**: 忽略分片上传 metadata / BOM part。
- **sync service snapshot skip**: 忽略协同服务中间 snapshot。
- **document_id resolution**: 从 key 中准确提取文档 ID。
- **get_document_basic**: 调用 DSS 获取文档基础元数据。
- **file_type resolution**: 准确解析文档文件类型并忽略不支持的类型。
- **document_version_id resolution**: 获取或解析正确的文档版本 ID。
- **publish_document_content_uploaded**: 调用 DSS 内部 API (`POST /internal/documents/{id}/content-uploaded`) 广播索引事件。

> **Important**:
> When upstream changes `services/search_upload_handler/src/handler.rs`, this fork worker must be reviewed for semantic parity.
