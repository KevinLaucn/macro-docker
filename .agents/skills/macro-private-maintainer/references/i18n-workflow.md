# i18n 国际化与渐进式二开规范指南

本文档记录 `KevinLaucn/macro` 自研与魔改二开模块的 i18n 国际化标准工作流。

---

## 核心架构原则

1. **彻底摆脱构建期 AST 自动注入**：
   - 历史架构通过 Babel 插件在构建阶段对所有 JSX 文本自动插入 `__t()`，导致源码不可见、二开容易产生构建副作用、混淆动态模板与静态字面量。
   - 新架构全面采用显式 `t()` 运行时：`import { t } from '@macro/i18n';`。
2. **保留现有轻量运行时与翻译资产**：
   - 轻量运行时位于 `packages/fork/i18n/runtime.ts`，支持响应式切换、对象选项（`{ context, fallback }`）、变量插值以及常用日期/数字格式化。
   - 翻译资产集中于 `packages/fork/i18n/locales/zh-CN.json`，以英文原文作为 fallback key，无需额外拆分为零散的语义 key 文件。
3. **渐进式排除与物理退役（Exclude & Sunset）**：
   - 在 `apps/web/vite.base.ts` 中通过 `i18nAstPlugin({ excludePatterns: [...] })` 将已改造或自研的二开模块显式排除在 AST 转换之外。
   - 随着二开范围覆盖所有业务模块，最终直接移除 Babel AST 插件与转换逻辑。

---

## 一、组件与词条快速定位（CodeGraph 优先）

进行界面多语言国际化二开时，**严禁盲目递归文件系统查找组件**：
1. **秒级定位路由或组件**：
   - 提取路由标识或组件符号（例如 `EmptyChatState`、`RecentSessionsSection`、`ChatTipsSection`、`SettingsAgent`）。
   - 运行 `codegraph explore <symbol>` 或 `codegraph node <symbol>` 快速定位目标文件路径与层级结构。
   - 使用 `codegraph callers <symbol>` 确认该组件挂载在哪个页面或父级视图中。
2. **索引刷新机制（Sync）**：
   - 若近期刚新增组件、重命名文件或发现 CodeGraph 返回结果不完整，立即在根目录执行增量同步：
     ```bash
     codegraph sync /Volumes/开发/macro
     ```
   - 保证索引在毫秒级内感知最新 AST 变更。

---

## 二、二开组件多语言开发标准

### 1. 显式引入与调用
在任何二开或重构的 SolidJS 组件中：
```tsx
import { t } from '@macro/i18n';

// 基础文本
<Button>{t('Save Draft')}</Button>

// 属性文本
<Input placeholder={t('Search contacts...')} />

// 带上下文消歧
<span>{t('Email', { context: 'nav' })}</span>

// 动态插值
<span>{t('Page {current} of {total}', { current: 1, total: 10 })}</span>
```

### 2. 改造后加入排除清单
只有整个文件的界面字段已显式化，才将其路径追加到 `apps/web/vite.base.ts` 的 `excludePatterns`。局部改造可以同时使用 `t` 与历史 AST 转换；插件必须依据实际 `__t` 导入绑定补齐导入，不能仅检查是否出现 `@macro/i18n` 字样。
```ts
i18nAstPlugin({
  excludePatterns: [
    '/features/settings/Settings.tsx',
    '/features/settings/Appearance.tsx',
    '/features/settings/Shortcuts.tsx',
    '/features/settings/Crm.tsx',
    '/features/block-email/component/compose/ComposeToolbar.tsx',
    // 在此追加新模块路径...
  ],
})
```

---

## 工具链使用指南（仅限推送 GitHub 前或大规模批量迁移时按需运行）

> 💡 **日常二开说明**：日常单页面/局部小修改时，不需要反复串行运行以下所有脚本。直接修改组件与 `zh-CN.json` 即可通过本地 Vite HMR（3000端口）热更新秒级查看效果。以下工具链仅在**准备推送 GitHub 远端**或**大规模模块批量改造完成核验**时使用。

### 1. 语法树审计检测 (`audit.ts`)
检查历史 JSX/属性文案的词典缺项，运行后会更新 `diff/audit-untranslated.json`。它不能证明所有界面字段都已接入翻译。
```bash
# 全局扫描（发布前或大重构使用）
bun run packages/fork/i18n/audit.ts

# 定向单文件检查（按需）
bun run packages/fork/i18n/audit.ts apps/web/src/features/settings/Settings.tsx
```

### 2. 词条提取与缺失核验 (`extract.ts`)
用于批量提取全局显式 `t()` 词条并检测 `zh-CN.json` 缺失情况：
```bash
bun run packages/fork/i18n/extract.ts
```

### 3. 单元测试校验
```bash
bun test packages/fork/i18n
```

### 4. 字段接线审计 (`audit-fields.ts`)

先用 CodeGraph 定位组件及其调用链，再运行作用域检查：

```bash
bun run packages/fork/i18n/audit-fields.ts apps/web/src/features/email-compose
# 完成显式迁移的文件可使用严格模式；存在未包裹字段或缺词条时退出非零。
bun run packages/fork/i18n/audit-fields.ts --strict <已迁移文件路径>
```

命令仅向标准输出写 JSON，不覆盖词典或历史审计报告。区分 `unwrapped`（已有词条也必须接线）、`missing-translation` 和 `interpolation-mismatch`；语法解析失败单列 `errors` 并退出非零。全局运行结果是迁移候选，历史 AST 已覆盖的静态文本仍会报告 `unwrapped`，不能将其全部视为线上漏译。

以下字段类型必须纳入每轮排查，新增类型同时更新审计回归用例：

- JSX 文本及 tooltip、aria-label、placeholder、backLabel 等属性；通过本地变量、导入常量、函数或 accessor 返回的文案。
- 连接 provider 的 outcome/capability 元数据、通知 subtext/facts/content、操作 actionLabel/blockedReason、错误/空状态/状态/ETA 条件分支。
- 回复/转发摘要、定时发送动作、共享权限与可见性说明；日期/数量/邮箱/人名使用插值或已翻译片段，不把用户数据当词条。
- 系统属性 displayName 与状态/优先级/阶段选项：按稳定字段或选项 ID 判断，在显示层翻译，保留自定义字段、原始值和存储 ID。
- 命令式 DOM 的 aria-label/data-placeholder 与 CSS/Quill picker 默认标签：译文须接入响应式更新，字体标识与 CSS 值保持原协议。
- 显式 t 常量词条、上下文回退及中英文插值参数一致性。模块顶层不可缓存 t 结果；在响应式 getter/渲染或触发通知时调用。

静态工具无法解析远端数据、复杂动态调用或任意运行期成员链。它不会执行回调，也不会证明这类字段已翻译；沿 CodeGraph 调用链人工检查对应 UI 消费点，并用运行时/组件或浏览器验证。品牌名、用户正文/签名/标题、邮箱、枚举、协议值及必须精确输入的确认短语不做自动替换。

修复后补齐 zh-CN 词条，核对新改动文件的 `.fork/customizations.yml` 精确 `paths/owned_paths`，更新漂移快照，并运行作用域审计和对应测试。临时脚本用于批量定位；发现的稳定规则必须转入 `field-audit.ts`、测试及本指南，不能仅留在 `/tmp`。

---

## Git 远端推送前门禁 (Pre-push CI & Audit Gate)
在向 GitHub 远端提交/推送代码前，可按需运行：
```bash
bun run packages/fork/i18n/extract.ts
just check
```
确保全库词条无缺失、格式与语法树门禁全部绿灯。
