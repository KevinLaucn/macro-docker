---
name: macro-upstream-sync
description: Safely synchronize macro-inc/macro upstream releases or mainline changes into the long-lived private fork. Use for upstream version updates, sync branches and PRs, fork-divergence review, customization-overlap analysis, merge-conflict resolution, and post-sync verification. Preserve fork business semantics, keep main untouched during sync, and stop for user decisions whenever a change is not provably mechanical.
---

# Macro Upstream Sync

## Fork 隔离目录与门禁

Fork-owned production code 默认位于 `packages/fork/<feature>/`；`.fork/` 只保存治理清单、
Hook 和 Override 定义。upstream-owned 文件只允许最小接入代码，Hook 必须登记到
`.fork/private-hooks.yml`，功能必须登记到 `.fork/customizations.yml`。

每次同步的固定顺序为：

```text
sync/upstream-* → merge upstream → Git conflict → private hooks → overrides --check
→ customization overlap → targeted tests → production build/image gate
```

`overrides --check` 或任何 Hook/manifest 检查失败都必须阻断；不得静默跳过。新增或移动
Fork 源码后，还必须验证 Bun/Cargo/TypeScript/Vite/Docker/Nix/CI 的构建闭包。

这是专门用于 **Macro 上游版本更新、Upstream Sync、同步 PR、冲突处理、Fork 定制保护** 的技能。

上游同步不是普通 `git merge`。

目标不是：

> 代码能编译、CI 能通过。

真正目标是：

> **完整同步上游，同时确保 Fork 已有业务语义不被误删、覆盖、弱化或静默改变。**

---

# 🚨 最高原则

以下原则优先级高于所有执行流程、测试结果、CI 状态以及“上游可能是这样设计的”之类的推测。

## 1. 绝不擅自替用户做业务决策

只要存在两种或以上合理解释，就必须停止相关修改并询问用户。

不得因为：

* 某个方案更容易实现
* 某个方案能编译
* 某个方案能让测试通过
* upstream 比我们的代码新
* AI 认为某个方案“更合理”

就擅自选择。

---

## 2. 无法证明是机械性问题，一律视为歧义

只有能够明确证明：

> **修改前后业务行为完全不变**

才属于机械性修复。

如果无法证明，就按业务歧义处理。

原则：

> **不确定 = 不修改。**

---

## 3. 宁可留下未解决问题，也不要擅自修改业务语义

Merge conflict 可以暂时不解决。

测试可以暂时失败。

CI 可以暂时不绿。

但是不能为了“完成任务”擅自改变：

* 产品行为
* 权限
* 数据语义
* 状态机
* self-host 架构
* API 行为
* 用户可见行为

---

## 4. 绝不为了编译或 CI 通过而静默降级功能

禁止擅自：

* 返回空数组
* 返回空对象
* swallow `401`
* swallow `403`
* swallow `404`
* swallow `500`
* catch 后忽略错误
* 增加 fallback
* 增加 no-op
* 增加 stub
* 关闭 feature flag
* 隐藏 UI
* 删除功能
* 绕过权限
* 放宽权限
* 修改数据库语义
* 修改默认值
* 跳过 migration
* 跳过 validation
* 跳过失败测试
* 修改测试来适配错误实现

测试暴露业务冲突时，应报告冲突，而不是把产品改到测试通过。

---

## 5. 不得擅自选择 `ours` / `theirs`

出现 Git conflict 时，不得仅因为：

* `ours` 能编译
* `theirs` 是最新上游
* `theirs` 修改更多
* `ours` 是我们的代码
* Git 自动 merge 没报错

就直接采用一边。

必须先回答：

1. upstream 新增或改变了什么语义？
2. 当前 `main` 保留了什么 Fork 语义？
3. 两者是不是应该组合？
4. 是否存在业务决策？

无法明确回答时，停止并询问用户。

---

## 6. 优先同时保留 Upstream 能力和 Fork 定制

默认目标不是：

> upstream 赢

也不是：

> Fork 赢

而是：

> **在没有真实冲突的情况下，同时保留两者。**

例如：

```text
upstream 新增 is_signal
+
Fork 已有 workflow_done
```

如果两者表达不同业务概念，应优先组合，而不是删除其中一个。

---

## 7. 上游新增功能不得因为“我们现在没用”就擅自删除

禁止因为当前 self-host 没启用某功能，就直接：

* 删除上游实现
* 强制 feature flag=false
* stub 掉接口
* 改为空实现
* 不合并该代码

如果确实缺少基础设施，应报告：

* 依赖什么
* 当前为什么无法运行
* 开启的成本
* 关闭的影响

由用户决定。

---

## 8. 同步期间绝不修改 `main`

整个 upstream sync 必须发生在专用分支：

```text
main
  ↓
sync/upstream-xxx
  ↓
merge upstream
  ↓
修复
  ↓
测试
  ↓
PR -> main
```

禁止：

* 直接在 `main` merge upstream
* 在 `main` 修 sync 问题
* commit 到 `main`
* 为了让 PR 工作而临时修改 `main`

`main` 始终作为当前稳定基线。

---

## 9. 禁止顺手重构和扩大范围

Upstream Sync PR 只负责：

> **同步 upstream + 正确保留 Fork 定制。**

除非解决同步问题必须，否则禁止：

* 顺手重构
* 清理旧代码
* 重命名无关变量
* 大面积格式化
* 调整目录结构
* 性能优化
* 架构优化
* 删除“看起来没用”的代码
* 修复无关 Bug
* 修改无关测试

发现独立问题可以报告，但不要顺手处理。

---

## 10. Generated 文件不是业务语义来源

包括：

* `.sqlx`
* generated TypeScript
* OpenAPI generated code
* GraphQL generated types
* schema snapshots
* generated storage models

正确顺序必须是：

```text
确认源代码语义
    ↓
修改源代码
    ↓
确认业务行为
    ↓
重新生成 artifacts
```

禁止：

```text
generated 报错
↓
直接改 generated
↓
让编译通过
```

Generated artifacts 是结果，不是业务决策依据。

---

# ✅ 可以直接自动修复的范围

只有**确定、单一结果、无业务歧义**的问题可以直接处理。

例如：

* upstream 移动文件造成的 import 错误
* symbol rename
* API 参数名称机械变化
* 类型签名变化但行为不变
* 明确的 import/export 错误
* 已确认 source query 后重新生成 `.sqlx`
* 已确认 source model 后重新生成 OpenAPI
* 已确认 schema 后重新生成 GraphQL types
* formatter 自动格式化
* 完全等价的 Git 文本冲突

注意：

> **“能编译”不等于机械性修复。**

---

# 🛑 必须停止并询问用户的情况

以下情况不得自行修改。

## 业务逻辑

* `ours` / `theirs` 都合理
* 不确定应该保留、删除、替换还是组合
* upstream 和 Fork 修改同一个状态机
* upstream 和 Fork 修改同一个查询语义
* 用户行为发生变化

---

## Email

特别保护：

* `workflow_done`
* Signal
* Important
* Done
* inbox/work view
* inbound reactivation
* outbound reactivation
* Gmail sync
* Gmail link
* multi-inbox
* 邮件过滤逻辑
* 邮件状态机

---

## 权限 / Auth

包括：

* Authentication
* FusionAuth
* Admin
* Super Admin
* Gmail inbox limit
* Permission
* Role
* OAuth
* Login
* Signup
* 用户创建逻辑

任何权限扩大或缩小都属于业务决策。

---

## 数据库

包括：

* schema
* migration
* default
* nullable
* 删除数据
* destructive migration
* 状态字段
* persistence
* query semantics

---

## API

包括：

* HTTP status
* error handling
* 返回值含义
* 空值行为
* fallback
* retry
* API contract

---

## Self-host

包括：

* 服务是否启动
* 服务是否删除
* Macro Cloud dependency
* service discovery
* URL routing
* Docker topology
* feature flags
* 外部依赖
* secret / auth boundary

---

## 安全 / 隐私

任何涉及：

* 权限
* credential
* private data
* 外发请求
* Macro Cloud
* authentication
* token
* session

的改变必须人工确认。

---

# 📝 遇到歧义时的报告格式

发现歧义后：

**只报告，不修改。**

至少说明：

### 文件

```text
path/to/file.rs
symbol/function
```

### Upstream 行为

说明最新 upstream 的实际逻辑。

### 当前 Main 行为

说明 Fork `main` 当前逻辑。

### Sync Branch 当前状态

说明 merge 后发生了什么。

### 冲突点

明确指出：

> 为什么这不是简单 Git conflict，而是业务语义冲突。

### 方案 A

说明：

* 做什么
* 对 upstream 的影响
* 对 Fork 的影响
* 用户行为变化

### 方案 B

同上。

必要时提供方案 C。

### 推荐

可以给推荐方案。

但是：

> **未经用户确认，不得执行。**

---

# 🎯 Upstream Target 选择原则

默认：

> **同步最新 Stable Release。**

例如：

```text
v2026.9.7.1
```

而不是默认同步：

```text
upstream/main
```

因为 `upstream/main` 可能包含尚未正式 Release 的代码。

如果用户明确要求：

> 最新 main

才同步 `upstream/main`。

---

## 不需要一个 Release 一个 Release 地升级

例如当前 Fork 落后多个版本：

不需要：

```text
v1
↓
v2
↓
v3
↓
v4
```

逐个处理。

应该直接：

```text
当前 main
↓
最新 Stable Release
```

作为一次完整同步。

---

# 🔄 标准同步流程

## Step 1 — 检查当前状态

检查：

```text
git status
git branch
git remote
main HEAD
upstream target
fork divergence
```

确认：

```text
upstream = macro-inc/macro
```

---

## Step 2 — 确定同步目标

默认：

```text
latest stable release
```

记录：

```text
release tag
commit SHA
```

如果用户要求 `upstream/main`，明确说明：

> 此次同步包含未正式发布代码。

---

## Step 3 — 创建 Sync Branch

从当前 `main`：

```text
sync/upstream-<release>
```

例如：

```text
sync/upstream-v2026.9.7.1
```

记录当前：

```text
pre-sync main SHA
```

之后禁止修改 `main`。

---

## Step 4 — 读取 Fork Customization Manifest

必须读取：

```text
.fork/customizations.yml
```

它是 Fork 定制清单。

不能仅依赖 Git conflict 判断定制是否被影响。

---

## Step 5 — 检查 Upstream Overlap

运行：

```bash
ruby .github/scripts/check-upstream-overlap.rb \
  --base <pre-sync-commit> \
  --head <upstream-target>
```

识别：

> Upstream 本次修改了哪些 Fork 定制区域。

Overlap 只是审查信号，不代表一定冲突。

---

# Step 6 — Merge Upstream

在 Sync Branch：

```bash
git merge <upstream-target>
```

保留 merge commit。

禁止 silent discard 任意一边。

---

# Step 7 — 解决 Git Conflict

分两类。

### A. Mechanical

确定无业务含义：

```text
直接修
```

### B. Semantic

存在业务判断：

```text
停止
↓
报告
↓
等待用户决定
```

---

# Step 8 — 检查“没有 Git Conflict 的语义冲突”

这是非常重要的一步。

Git 显示：

```text
Auto-merging...
Merge made...
```

并不意味着没问题。

必须检查：

```text
upstream 修改区域
        ∩
Fork customization
```

特别检查调用链和最终行为。

必要时使用 CodeGraph：

```text
codegraph callers
codegraph callees
codegraph impact
codegraph explore
```

---

# Step 9 — Generated Artifacts

只有业务 source 已确认后才能：

```text
SQLx prepare
OpenAPI generate
GraphQL generate
TS generated models
schema refresh
```

禁止反过来。

---

# Step 10 — 比较 PR Branch 与 Main

核心审查对象：

```text
main
vs
sync branch
```

而不仅仅是 Git conflict 文件。

这个 Diff 代表：

> **此次升级最终会给我们的产品带来什么变化。**

必须检查：

* upstream 新增了什么
* Fork 定制是否还存在
* Fork 定制是否被绕过
* 是否新增云依赖
* 是否改变 feature flag
* 是否改变服务拓扑
* 是否改变权限
* 是否改变数据库语义

---

# 🧪 测试失败处理原则

测试失败后先分类。

## 1. Mechanical Sync Error

例如 import 错误。

可以自动修。

---

## 2. Generated Artifact Mismatch

例如 `.sqlx` outdated。

在 source 已确认后可以重新生成。

---

## 3. Upstream Behavior Change

涉及产品语义：

询问用户。

---

## 4. Fork vs Upstream Semantic Conflict

询问用户。

---

## 5. Existing Test 与新业务语义冲突

不得直接修改测试。

先确认：

> 到底测试错了，还是实现错了。

如果涉及业务行为，询问用户。

---

# 🛡️ 每次同步重点保护区域

至少检查：

## Email

```text
workflow_done
Signal
Important
Done
Inbound Reactivation
Outbound Reactivation
```

## Gmail

```text
Sync
Link
Multi Inbox
Admin permissions
OAuth
```

## Auth

```text
FusionAuth
Role
Permission
Admin
User provisioning
```

## Self-host

```text
service topology
service discovery
Macro Cloud dependency
runtime URLs
feature flags
```

## i18n

```text
zh-CN
translation
explicit t()
```

## CI

```text
image build
release
upstream sync
SQLx
Nix
```

## Contract

```text
SQLx
GraphQL
OpenAPI
Generated schema
```

这个列表不能替代：

```text
.fork/customizations.yml
```

Manifest 才是正式定制清单。

---

# Customization Manifest 维护

如果同步过程中发现：

* 新增 Fork 定制
* 删除 Fork 定制
* 定制改名
* 路径变化
* Test group 变化

必须同步更新：

```text
.fork/customizations.yml
```

每个 customization 应包含：

* Stable ID
* Title
* Rationale
* Risk
* Paths
* Tests

对于真正修改 upstream core semantics 的代码，可保留：

```text
FORK-CUSTOM: <ID>
```

但 generated code 不应加这种 marker。

---

# 🚫 PR / Main 操作限制

未经用户明确要求，不得：

* Push
* 开 PR
* Approve PR
* Merge PR
* 修改 main
* Close PR
* Force push

可以：

* 分析
* 修改 Sync Branch
* 测试
* 报告

外部操作必须由用户明确授权。

---

# 📋 最终 Sync Report

准备推荐 Merge 回 `main` 前，必须输出：

### Upstream

```text
Target Release:
Target SHA:
Upstream Range:
```

### Fork

```text
Pre-sync Main SHA:
Sync Branch:
```

### Customization

```text
Overlapping customization IDs:
```

### Conflict

```text
Mechanical conflicts fixed:
Semantic conflicts decided by user:
Unresolved semantic conflicts:
```

### Generated

```text
SQLx:
OpenAPI:
GraphQL:
Generated TS:
```

### Testing

```text
Tests:
CI:
Build:
```

### Risk

```text
Remaining risks:
```

最后明确确认：

```text
main was not modified during synchronization.
```

---

# 最终目标

目标不是：

> **让代码能编译。**

也不是：

> **让 CI 全绿。**

而是：

* 上游新功能完整进入
* Fork 定制不被误删
* Fork 定制不被静默绕过
* 用户行为不发生未经确认的变化
* 数据语义不发生未经确认的变化
* 权限不发生未经确认的变化
* Self-host 架构不发生未经确认的变化
* PR Diff 每一个重要变化都能解释
* 所有非机械性业务决策都由用户确认

---

# 最终铁律

**确定是机械性问题：直接修。**

**无法证明是机械性问题：按歧义处理。**

**存在歧义：必须问用户。**

**宁可留下冲突，也不要擅自做业务决策。**

**绝不为了编译通过而改变产品行为。**

**绝不为了 CI 通过而改变产品行为。**

**绝不替用户做业务决策。**
