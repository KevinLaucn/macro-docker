# WebSocket 与实时消息网关规范 (Realtime & Gateway Spec)

## 1. 架构组件与拓扑

- **邮件实时链路**：`document_storage_service` 的 `/items/soup/graphql/ws` 提供官方 GraphQL Soup/notification 订阅；`connection_gateway`、`websocket_service` 继续承载各自的其他实时能力。邮件保护与回归流程见 [mail-realtime-contract.md](mail-realtime-contract.md)。
- **本地化约束**：VPS self-host 环境下前端与服务端必须直连本地 WebSocket 端口，严禁尝试向 `wss://*.macro.com` 发送任何握手或订阅请求。

## 2. 优雅重试与异常静默

- **重试风暴阻断**：当某项协同/实时功能在私有化环境下未部署或已关闭时，前端必须静默阻断连接尝试，严禁出现无限递增重试、Console 错误风暴或主线程冻结。
- **通道过滤**：仅监听与当前启用功能（如新邮件到达、未读角标刷新）匹配的实时 Topic。对于未启动的 Collaboration、Canvas、Calls 广播通道，前端一律不创建监听器。
