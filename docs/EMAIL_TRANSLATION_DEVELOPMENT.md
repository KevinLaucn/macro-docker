# 邮件翻译二开开发文档

## 人话需求

在邮件列表和邮件详情里加翻译小按钮。用户点一下，只翻译当前邮件相关内容；再点一下，恢复原文。

列表里只翻译这一行的标题和预览内容。详情页顶部按钮翻译当前邮件对话，单封邮件头部按钮只翻译这一封邮件。总开关只控制这些按钮是否出现，不会自动翻译。

## 结论

邮件翻译功能归档在 `/Volumes/开发/macro/packages/fork/email-translation/`。

该功能是 `apps/web` 使用的前端二开能力，不是面向上游的共享包。按二开规范，完整实现放在独立 fork package 中，并通过设置页和邮件 UI 做最小接入。

第一版使用 Chrome Built-in Translator API + LanguageDetector API，不接后端 API，不接云端翻译 API，不新增 DB，不新增 migration，不使用整页翻译。

## 功能定位

邮件翻译是 fork 专属二开能力，独立于 Macro 原生邮件系统之外。

它只负责在邮件列表和邮件阅读界面提供 Chrome 浏览器内建文本翻译入口，不改变邮件原文、同步、索引、搜索、存储、发送、回复或转发流程。

启用总开关只表示用户允许显示邮件翻译入口，不代表系统自动翻译邮件。

## 推荐目录

核心功能目录：

- `/Volumes/开发/macro/packages/fork/email-translation/`

设置页接入点：

- `/Volumes/开发/macro/apps/web/src/features/extensions/Extensions.tsx`

邮件列表接入点：

- `/Volumes/开发/macro/apps/web/src/features/entity/composed/list-entity/email.tsx`
- `/Volumes/开发/macro/apps/web/src/features/entity/composed/list-entity/wide-layout.tsx`

邮件详情接入点：

- `/Volumes/开发/macro/apps/web/src/features/block-email/component/TopBar.tsx`
- `/Volumes/开发/macro/apps/web/src/features/block-email/component/EmailMessageTopBar.tsx`
- `/Volumes/开发/macro/apps/web/src/features/block-email/component/EmailMessageBody.tsx`
- `/Volumes/开发/macro/apps/web/src/features/block-email/component/MessageContainer.tsx`

## 放入 fork package 的原因

`packages/fork/` 是私有二开实现的隔离边界；`packages/` 中的 upstream workspace 包仍用于跨应用或跨模块复用能力。

邮件翻译虽然只服务 `apps/web` 的邮件界面，但其完整实现必须与 upstream-owned 邮件文件隔离，以降低后续 upstream sync 冲突成本。package 通过 app 的类型路径和 Vite 构建闭包复用现有 UI/邮件类型。

## 第一版边界

第一版只做：

- 在“拓展 / 邮件功能增强”中新增“邮件翻译”总开关
- 总开关关闭时，不显示翻译入口，不初始化 Translator / LanguageDetector，也不触发翻译语言模型下载
- 总开关开启时，在邮件列表预览和邮件详情显示翻译入口
- 用户点击后才翻译
- 再次点击恢复原文
- 翻译结果只存在前端显示层

第一版禁止：

- 自动翻译
- 整页翻译
- 通过“整页翻译 + 排除其它区域”实现局部翻译
- 保存翻译结果到后端
- 修改邮件正文 HTML 原始数据
- 修改 MacroDB
- 新增 email service API
- 接入 Google Translate API、OpenAI 或其它云端翻译 API
- 通过后端代理邮件内容

## 翻译引擎边界

第一版翻译引擎固定为：

- Chrome Built-in Translator API
- Chrome LanguageDetector API

调用形态：

- `LanguageDetector` 检测源语言
- `Translator.create({ sourceLanguage, targetLanguage })` 创建翻译器
- `translator.translate(text)` 翻译文本字符串

不使用：

- Google Website Translator 整页小部件
- Google Translate Cloud API
- OpenAI 或其它 AI 翻译 API
- iframe / DOM hack

当前明确不把 Google Website Translator 整页小部件作为第一版实现方案。

原因：

- Google Website Translator 的典型能力是整页翻译
- 它支持通过 `notranslate` / `translate="no"` 排除不想翻译的区域
- 但它不是稳定的“只翻译某个 div”的前端 API
- 在 Macro 中使用整页翻译再排除其它区域，容易误翻译导航、按钮、日期、标签、虚拟列表复用行和其它 UI 文案

因此第一版不走“整页 Google widget + 过滤区域”。

隐藏 iframe、临时隔离 DOM、整页 widget hack、用户选择文本后借助浏览器扩展菜单等方式，在未验证前不得作为实现方案。

可交付方案必须满足：

- 调用范围可控
- 状态可控
- 可恢复原文
- 不污染全局 DOM
- 不翻译 Macro UI

支持范围：

- Chrome Desktop：支持
- Macro Web / Tauri 中兼容 Chromium API 的环境：运行时检测
- Safari：不支持
- Firefox：不支持
- Mobile Chrome：不支持
- Mobile Safari：不支持

运行时检测：

- `'Translator' in globalThis`
- `'LanguageDetector' in globalThis`

不支持时直接隐藏翻译入口，不做 fallback。

第一版只支持标准 API 形态，不适配早期实验别名：

- 不适配 `window.translation.createTranslator`
- 不适配 `window.ai.translator`

原因是这些别名属于早期/实验形态，API 形态和行为可能不一致。为了兼容它们需要额外适配层和测试矩阵，第一版收益不高。

翻译器实例需要池化，但不是全局只保留一个实例。

池化规则：

- 按语言方向复用 translator 实例
- `en -> zh` 使用一个实例
- `zh -> en` 使用另一个实例
- `ja -> zh` 使用另一个实例
- key 格式：`${sourceLanguage}:${targetLanguage}`

原因：`Translator.create({ sourceLanguage, targetLanguage })` 绑定具体语言方向，不同语言方向不能共用同一个实例。

失败处理：

- 如果某个语言对创建失败，不缓存失败实例
- 如果已缓存实例后续翻译失败，应从池中移除该语言对实例，下次重新创建
- 实例池只保存在当前 tab/session 内存中，不跨刷新持久化

## 目标语言

第一版目标语言默认使用当前 Macro UI 语言。

映射：

- `en-US` -> `en`
- `zh-CN` -> `zh`

源语言由 `LanguageDetector` 检测。

如果源语言与目标语言相同，直接不翻译，并保持原文。

第一版不增加单独的目标语言设置。

## 邮件列表预览翻译

邮件列表预览必须做点对点文本翻译，不做整页翻译。

目标区域是邮件列表行中的 subject + snippet。当前源码结构：

- `WideLayout` 中 `Entity.Slot placement="content"` 是列表行主内容列
- 邮件类型分支渲染 `EmailWideContent`
- `EmailWideContent` 内部依次渲染发件人、标签、标题、snippet
- 标题来自 `Entity.Title entity={props.entity}`
- 预览正文来自 `EmailSnippet`

交互：

- 在邮件行左侧或 subject 前方增加小翻译图标
- 默认 hover 当前行时显示，避免列表变吵
- 点击第一次：只翻译当前行 subject + snippet
- 点击第二次：恢复当前行原文
- 翻译中显示 loading 状态
- 翻译失败保留原文并 toast 提示

显示规则：

- 翻译结果默认替换当前行 subject + snippet 的显示文本
- 不新增第二行，避免行高变化和虚拟列表抖动
- 不翻译发件人、标签、时间戳、日期、按钮、侧边栏
- 不影响列表虚拟滚动

状态 key：

- `row-preview:{threadId}`

## 邮件详情翻译

邮件详情页需要两级翻译按钮：对话级全局按钮和单封邮件按钮。

### 对话级全局翻译按钮

目标：

- 翻译当前邮件对话中的所有已加载邮件正文
- 点击第一次：翻译当前对话
- 点击第二次：恢复当前对话原文
- 不翻译整个应用页面
- 不翻译左侧导航、顶部工具栏、标签、日期、发件人、收件人等 UI 元素

挂载位置：

- `/Volumes/开发/macro/apps/web/src/features/block-email/component/TopBar.tsx`

源码判断：

- `TopBar` 是邮件详情页顶部工具栏
- `SplitHeaderRight` 里已有未读/完成按钮
- 对话级翻译按钮应放在这个区域，作为当前邮件线程操作
- `ResponsiveBlockToolbar` 菜单里可补一个同等操作，但主入口是顶部小图标

状态 key：

- `thread:{threadId}`

### 单封邮件翻译按钮

目标：

- 每封展开邮件头部增加一个小翻译按钮
- 按钮放在回复图标前面
- 点击第一次：只翻译当前邮件正文
- 点击第二次：恢复当前邮件原文
- 不影响同一对话中的其它邮件

挂载位置：

- `/Volumes/开发/macro/apps/web/src/features/block-email/component/EmailMessageTopBar.tsx`

源码判断：

- `HeaderTopRow` 渲染展开邮件的头部行
- `MessageActions` 渲染回复、转发等动作
- 单封邮件翻译按钮应挂在 `MessageActions` 前面
- `MessageContainer` 负责把当前 `message` 传给 `EmailMessageTopBar` 和 `EmailMessageBody`
- `EmailMessageBody` 负责渲染邮件正文
- 普通文本走 `StaticMarkdown`
- HTML 邮件走 shadow DOM host

状态 key：

- `message:{messageId}`

## HTML 邮件正文翻译

HTML 邮件不能把完整 HTML 字符串直接交给 `translator.translate()`。

禁止：

- 翻译 `<div>...</div>` 这类 HTML 字符串
- 把链接、图片、style、class、table 布局、CID 图片引用交给翻译模型
- 修改 `body_html_sanitized`
- 修改 `body_text`
- 修改 `body_macro`

正确方式：

- 解析原始 HTML 为 inert DOM
- clone DOM
- 用 `TreeWalker` 遍历可见 Text Node
- 按块收集文本
- 只对文本节点调用 `translator.translate(text)`
- 只替换 clone 中对应节点的 `textContent`
- 序列化得到 translated HTML
- 恢复原文时直接重新使用原始 source

建议新增：

- `/Volumes/开发/macro/packages/fork/email-translation/translateText.ts`
- `/Volumes/开发/macro/packages/fork/email-translation/translateHtml.ts`
- `/Volumes/开发/macro/packages/fork/email-translation/translateMessage.ts`
- `/Volumes/开发/macro/packages/fork/email-translation/translateThread.ts`

正文渲染接入点：

- `/Volumes/开发/macro/apps/web/src/features/block-email/component/EmailMessageBody.tsx`

接入原则：

- `EmailMessageBody` 只选择显示原文还是翻译结果
- HTML 邮件继续使用原有 shadow DOM 渲染路径
- 普通文本继续使用 `StaticMarkdown`
- Show original 不做反向翻译，只恢复原始 source

## 状态优先级

优先级：

- 单封邮件手动切换优先级高于对话级全局状态
- 对话级按钮开启后，默认翻译当前 thread 所有邮件
- 用户对某一封邮件单独点“恢复原文”时，该邮件覆盖 thread 全局翻译状态
- 对话级再次点击恢复原文时，清空 `thread:{threadId}`，并清空该 thread 下的 `message:{messageId}` 覆盖状态

状态默认存在前端内存中。第一版不做跨刷新持久化，避免翻译结果与邮件更新后的原文失配。

## 设置开关语义

设置页总开关是 browser-local setting，不是账号级云设置。

注意：只有“功能开关”持久化到 localStorage；翻译结果、thread/message 翻译状态和 message 覆盖状态第一版都不跨刷新持久化。

建议 key：

- `macro.emailTranslation.enabled`

语义：

- 当前浏览器/Profile 保存
- 刷新后保留
- 不跨设备
- 不跨浏览器
- 不需要 backend/DB

该开关可以复用当前 Extensions 本地状态模式。

## 全局按钮组件

翻译按钮使用一个全局复用组件：

- `/Volumes/开发/macro/packages/fork/email-translation/EmailTranslateButton.tsx`

该组件用于：

- 邮件列表行翻译按钮
- 邮件详情顶部对话级翻译按钮
- 单封邮件头部翻译按钮

组件职责：

- 图标
- tooltip
- loading 状态
- 已翻译高亮状态
- disabled 状态
- 点击事件

组件不负责：

- 调用翻译能力
- 读写翻译缓存
- 判断 thread/message/row 状态
- 处理邮件正文 DOM

建议 props：

- `state: 'idle' | 'loading' | 'translated' | 'error'`
- `scope: 'row' | 'thread' | 'message'`
- `onClick`
- `disabled?`

## 状态模型

内部状态不只存 boolean，使用明确模式：

- `inherit`
- `translated`
- `original`

规则：

- `thread = translated` + `message = inherit` -> 显示翻译
- `thread = translated` + `message = original` -> 显示原文
- `thread = original` + `message = translated` -> 显示翻译

线程恢复原文时：

- 清空 `thread:{threadId}`
- 清空该 thread 下所有 `message:{messageId}` 覆盖状态

## 图标交互

推荐使用小图标按钮，不使用文字按钮。

图标建议：

- 优先用现有图标库中的 `Translate` / `Languages` / `Globe`
- 如果没有可用翻译图标，使用 `Globe`
- 列表行按钮默认 hover 显示
- 详情顶部按钮常驻显示
- 单封邮件按钮跟随现有邮件动作按钮显示

状态：

- 未翻译：普通灰色图标
- 翻译中：loading 状态
- 已翻译：accent 高亮
- 翻译失败：保留原文并 toast 提示

交互要求：

- hover 显示 tooltip：`Translate` / `Show original`
- 点击按钮必须 `stopPropagation`，避免触发展开、折叠、选中、回复等父级行为
- 按钮尺寸对齐现有 `Button size="icon-sm"`

## 隐私提示

虽然该方案不经过 Macro 后端，也不接服务端 API，但用户主动使用浏览器侧 Google 翻译时，邮件内容可能会被 Google 处理。

设置项或首次使用提示中应明确说明：

- 翻译由浏览器侧 Google 翻译能力提供
- 启用开关不会自动翻译邮件
- 用户点击翻译后，当前邮件内容可能由 Google 处理

## 二开接入原则

遵循“独立文件与最小接入原则”：

- 大量二开逻辑放在 `packages/fork/email-translation/`
- 上游原文件只保留最小 import、组件挂载或 props 透传
- 接入点尽量控制在 1 到 3 行
- 所有修改 upstream-owned 文件的翻译接入点都必须使用 `PRIVATE-HOOK:` 标记并同步维护 fork 定制清单

建议 hook 标记：

- `PRIVATE-HOOK: email_translation:list-row`
- `PRIVATE-HOOK: email_translation:thread`
- `PRIVATE-HOOK: email_translation:message`
- `PRIVATE-HOOK: email_translation:body`

## 建议新增文件

- `/Volumes/开发/macro/packages/fork/email-translation/EmailTranslateButton.tsx`
- `/Volumes/开发/macro/packages/fork/email-translation/emailTranslationState.ts`
- `/Volumes/开发/macro/packages/fork/email-translation/translatorClient.ts`
- `/Volumes/开发/macro/packages/fork/email-translation/languageDetector.ts`
- `/Volumes/开发/macro/packages/fork/email-translation/translateText.ts`
- `/Volumes/开发/macro/packages/fork/email-translation/translateHtml.ts`
- `/Volumes/开发/macro/packages/fork/email-translation/translateMessage.ts`
- `/Volumes/开发/macro/packages/fork/email-translation/translateThread.ts`
- `/Volumes/开发/macro/packages/fork/email-translation/index.ts`

## 已确认决策

- 功能不放 `packages/`
- 功能放 `packages/fork/email-translation/`
- 设置页加一个总开关
- 总开关只控制翻译入口是否显示，不自动翻译
- 邮件列表预览只翻译当前行 subject + snippet
- 邮件列表预览翻译结果默认替换原文显示，不新增第二行
- 邮件详情顶部增加当前对话级翻译按钮
- 展开后的单封邮件头部，在回复图标前增加单封邮件翻译按钮
- 翻译按钮使用同一个 `EmailTranslateButton.tsx` 组件
- 第一版使用 Chrome Built-in Translator API + LanguageDetector API
- 第一版不接后端 API、不接云端翻译 API、不新增 DB、不新增 migration
- 第一版不采用整页 Google Website Translator 小部件
- 第一版桌面 Chrome 支持，其它浏览器和移动端不显示入口
- 目标语言默认使用当前 Macro UI 语言
- 所有进入 Macro Email UI 的邮件都启用，不限制 Gmail

## 验收标准

- 开关关闭：0 翻译按钮、0 Translator 初始化、0 LanguageDetector 初始化、0 模型下载触发
- 行翻译：只改变当前行 subject + snippet
- 虚拟列表滚动回来后状态正确
- 单封翻译不影响其它邮件
- thread 翻译只作用于当前 thread
- 单封 original 可以覆盖 thread translated
- thread restore 清空 message override
- HTML 标签、链接、图片、布局不变
- Show original 100% 回原始数据

## 待确认问题

- Chrome Translator API 在当前 Web/Tauri 运行环境中的实际可用性
- 是否需要为不支持的环境显示“当前浏览器不支持翻译”的设置页说明
