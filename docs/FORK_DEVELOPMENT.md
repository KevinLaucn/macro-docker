# 私有二开开发规范

本仓库的二开代码、官方源码和同步治理规则分层管理：

```text
packages/fork/<feature>/  二开功能的完整实现
.fork/                    规则、Hook、Override 和门禁
官方目录                  只保留最小接入口
```

## 1. 目录规则

- 一个二开功能一个目录，例如 `packages/fork/email-translation/`、
  `packages/fork/read-receipts/`、`packages/fork/self-host-health/`。
- 前端、后端、脚本、配置属于同一个功能时，优先收口到同一个功能目录；
  不为了形式强制拆成 `frontend/backend/rust/web`。
- `.fork/` 只放治理文件，不放主要业务代码。
- 老功能不要求一次性迁移；后续修改该功能时顺带迁移。

## 2. 官方源码接入

官方文件只允许保留最小接入代码：`import`、`register`、组件 Hook、路由挂载
或一行调用。业务逻辑必须放在 `packages/fork/<feature>/`。

每个官方源码接入点必须：

1. 添加唯一的 `PRIVATE-HOOK:` 标记；
2. 登记到 `.fork/private-hooks.yml`，填写官方文件、接入点和预期代码；
3. 运行 `ruby .github/scripts/check-private-hooks.rb`；
4. 同一区域已有多个二开时，优先增加一个统一 Fork 入口，由入口内部组合功能。

## 3. 固定覆盖

默认模型、云服务地址、遥测地址和固定开关等简单替换放到
`.fork/overrides/*.yml`，不要在上游文件中重复手改。

每条 Override 必须声明：唯一 ID、目标文件、原文、替换文本和精确匹配数量。
检查器支持模拟检查；原文不存在、替换文已存在、或匹配数量不等于声明值，均直接失败，
不得静默跳过。

## 4. Upstream 同步流程

禁止在 `main` 上直接进行 upstream 合并，也不直接向 GitHub `main` 推送开发提交。
所有同步使用 `sync/upstream-*` 分支：

```text
创建 sync/upstream-* 分支
→ 合并 upstream/main
→ 处理 Git 硬冲突
→ just fork-gate
→ 运行命中的功能测试
→ 构建
→ 通过 PR 合并到 main
```

`just fork-gate` 检查：

- `private-hooks`：接入口仍存在且唯一；
- `overrides --check`：固定覆盖仍能精确应用；
- `customizations`：上游是否触碰受保护区域；
- `zero-cloud`：自托管构建路径是否新增官方服务或遥测 endpoint。

门禁失败时只修复命中的二开点。门禁通过不代表语义审查可以省略；上游修改某个功能
关联文件时，必须运行该功能的 targeted test。

### Runtime 与零云依赖

`SELFHOST-RUNTIME-001` 属于部署/runtime 基础设施，不迁移到 `packages/fork/`。
Docker、Nix、self-host compose、`macroctl` 和 Just 入口保持原目录。固定 URL、默认值和
feature flag 使用 Override；少量语义兼容补丁使用 `PRIVATE-HOOK`。零云门禁只扫描自托管
构建路径，允许文档、测试 fixture 和示例域名，不把上游产品默认值误判为私有 runtime 违规。

Telemetry/analytics 单独登记为 `TELEMETRY-PRIVACY-001`，不与 runtime 风险混合。

### Fork 补丁退役

小型稳定性补丁也不能永久保留。每个可能被 upstream 吸收的补丁登记到
`.fork/retirements.yml`，记录旧行为签名、上游修复签名和回归测试：

```text
上游出现修复签名
→ 机器门禁标记 retirement candidate
→ 运行回归测试并检查用户行为等价
→ 人工确认
→ 删除 Fork 实现、PRIVATE-HOOK、customization/retirement 登记
```

门禁只负责发现候选，不自动删除代码；这样不会因为字符串相似或局部重构误删行为。

## 5. 提交边界

- 一个功能域一个小提交，避免把 upstream、二开、生成文件混在一起。
- 新增或移动二开文件后，检查 Cargo、Bun、Docker、Nix、复制清单和构建上下文。
- 推送前必须确认当前分支不是 `main`，目标是当前同步分支的 PR；本规范文档和二开代码
  不通过直接 push 进入 GitHub `main`。

## 常用命令

```bash
just fork-gate
ruby .github/scripts/check-private-hooks.rb
ruby .github/scripts/check-fork-overrides.rb --check
ruby .github/scripts/check-upstream-overlap.rb --base upstream/main --head HEAD
ruby .github/scripts/check-fork-retirements.rb --upstream upstream/main
```
