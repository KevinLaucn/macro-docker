# 私有二开开发规范

本仓库长期跟随 `macro-inc/macro`。默认原则只有一个：**upstream-owned
行为以上游为权威，二开只保留明确登记的差异。**

如果 upstream bug 不影响正常使用、也不违反 self-host/privacy/明确二开契约，
不要在 Fork 独立修复、加 defensive fallback 或顺手重构；等待官方修复并在后续
sync 获取。只有阻塞正常使用或违反明确 Fork invariant 时才允许临时补丁，并且
必须可识别、可测试、可退役。

## 1. 代码边界

```text
packages/fork/<feature>/  二开功能完整实现
.fork/                    ownership / Hook / Override / Retirement / upstream anchor
官方目录                  只保留最小接入口
```

完整二开功能优先放 `packages/fork/<feature>/`。Docker、Nix、self-host、
`macroctl` 等部署/runtime 基础设施保持原有目录，但仍受 Fork manifest 管理。

不要为了二开功能搬迁、删除或复制 upstream 文件。必须接入 upstream 文件时，
以当前 upstream 文件为主体重新注入最小 Hook。

## 2. Customization ownership

`.fork/customizations.yml` 中两个路径字段语义不同：

- `paths`：watch scope。用于 upstream overlap、语义审查和 targeted test，可较宽。
- `owned_paths`：真正允许与 upstream 不同的**精确文件路径**，禁止 glob。

因此 `services/email_service/**` 可以作为监控范围，但不能自动授权整个目录
长期偏离 upstream。新增 upstream-owned 改动时必须把具体文件加入正确
customization 的 `owned_paths`。

`remaining-core-diffs.yml` 是从当前树生成的 v2 快照，不是历史 allowlist。
任何已经与 upstream 相同的 owned path 都属于 stale ownership，门禁失败。

## 3. PRIVATE-HOOK

每个 upstream-owned 语义接入点必须：

1. 使用唯一 `PRIVATE-HOOK:<namespace>:<name>`；
2. 在 `.fork/private-hooks.yml` 显式填写 `customization` owner；
3. owner 的 `paths` 必须覆盖该文件；
4. 如果该文件存在于 upstream，owner 的 `owned_paths` 必须精确列出它；
5. 保留可验证的 `expected` 和 `context`；
6. 对应 customization 必须有 targeted regression test。

同一 upstream 文件允许多个不同功能 Hook，但每个 Hook 自己只有一个语义 owner。
不要依赖“这个文件刚好被另一个宽 customization 覆盖”。

## 4. 官方 Skills

upstream 提供的 `.agents/skills/<name>/` 必须**整个 Skill 目录 0 diff**，包括：

- `SKILL.md` / `skill.md`
- `agents/openai.yaml`
- references / scripts / assets
- symlink 或其它 upstream Skill 文件

所有 Fork 工作流规则只写入
`macro-private-maintainer`、`macro-upstream-sync`、
`macro-pre-push-gate` 等 Fork 自有 Skills，绝不修改官方 Skill。

## 5. Upstream anchor

`.fork/upstream.yml` 记录 `main` 最后一次实际合入的 upstream SHA。

普通 feature 开发运行 `just fork-gate` 时默认使用这个固定 SHA，所以 upstream
刚出现新提交不会无关地阻塞日常二开。

upstream sync 则显式使用 live `upstream/main`，并启用 strict ancestry；目标 SHA
必须已经成为 sync branch 的祖先，同时 `.fork/upstream.yml` 必须更新到同一 SHA。

## 6. Upstream 同步

禁止直接在 `main` 做 upstream merge。使用 `sync/upstream-*`：

```text
main
→ sync/upstream-*
→ merge upstream/main（保留 ancestry）
→ upstream-first 解决冲突
→ 更新 ownership / hooks / retirements
→ 更新 .fork/upstream.yml
→ 重建 remaining-core-diffs.yml
→ just fork-gate
→ targeted tests / build
→ PR 回 main
```

同步必须看两份 diff：

```bash
# upstream 自上次同步后改了什么
git diff --name-status <last-merged-upstream>..<target-upstream>

# 冲突处理后 Fork 还与目标 upstream 差什么
git diff --name-status <target-upstream>..HEAD
```

第二份 diff 中每个 upstream-owned 文件必须有精确 owner 或 exact override。
删除 upstream-owned 文件直接失败；如果只是为了接 Hook，不允许把官方
`foo.rs` 搬成 Fork 的 `foo/mod.rs`。

完成 ownership review 后刷新派生快照：

```bash
ruby .github/scripts/check-core-drift.rb \
  --upstream upstream/main \
  --write-snapshot

CHECK_BASE=upstream/main FORK_SYNC_STRICT=1 just fork-gate
```

CI 的 upstream-sync workflow 会自动启用 strict ancestry。

## 7. Override 与 Retirement

固定模型、固定 URL、默认开关等机械替换使用 `.fork/overrides/*.yml`；必须声明
目标文件、原文、替换文本和精确匹配数量。

可能被官方吸收的临时补丁登记 `.fork/retirements.yml`：

```text
upstream 出现等价修复
→ retirement gate 报 candidate
→ 跑回归测试确认行为
→ 删除 Fork 实现 / Hook / owned_path / retirement
→ 重建 drift snapshot
```

不要因为字符串相似自动删除功能，也不要在 upstream 已经等价后继续保留 Fork
历史补丁。

## 8. 验收

机器入口统一为：

```bash
just fork-gate
```

门禁通过仍不替代语义审查。同步命中某 customization 的 watch scope 时必须运行
对应 targeted tests；release/production 再执行完整 build/image 验收。

提交时保持功能域边界清晰，不把 upstream merge、无关 refactor 和二开功能混成
一个不可审计的大提交。
