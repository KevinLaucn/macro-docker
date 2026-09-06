# i18n 国际化与渐进式二开规范指南

本文档记录 `KevinLaucn/macro` 自研与魔改二开模块的 i18n 国际化标准工作流。

---

## 核心架构原则

1. **彻底摆脱构建期 AST 自动注入**：
   - 历史架构通过 Babel 插件在构建阶段对所有 JSX 文本自动插入 `__t()`，导致源码不可见、二开容易产生构建副作用、混淆动态模板与静态字面量。
   - 新架构全面采用显式 `t()` 运行时：`import { t } from '@macro/i18n';`。
2. **保留现有轻量运行时与翻译资产**：
   - 轻量运行时位于 `packages/i18n/runtime.ts`，支持响应式切换、对象选项（`{ context, fallback }`）、变量插值以及常用日期/数字格式化。
   - 翻译资产集中于 `packages/i18n/locales/zh-CN.json`，以英文原文作为 fallback key，无需额外拆分为零散的语义 key 文件。
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
每次完成某个二开文件或目录的显式化改造后，打开 `apps/web/vite.base.ts`，将其路径追加到 `excludePatterns`：
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
用于只读扫描代码中遗漏未包裹 `t()` 的 JSX 文本或属性：
```bash
# 全局扫描（发布前或大重构使用）
bun run packages/i18n/audit.ts

# 定向单文件检查（按需）
bun run packages/i18n/audit.ts apps/web/src/features/settings/Settings.tsx
```

### 2. 词条提取与缺失核验 (`extract.ts`)
用于批量提取全局显式 `t()` 词条并检测 `zh-CN.json` 缺失情况：
```bash
bun run packages/i18n/extract.ts
```

### 3. 单元测试校验
```bash
bun test packages/i18n
```

---

## Git 远端推送前门禁 (Pre-push CI & Audit Gate)
在向 GitHub 远端提交/推送代码前，可按需运行：
```bash
bun run packages/i18n/extract.ts
just check
```
确保全库词条无缺失、格式与语法树门禁全部绿灯。
