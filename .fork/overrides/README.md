# Fork overrides

此目录只存放固定、机械、可精确替换的上游覆盖定义（YAML）。主要二开业务代码放在
`packages/fork/<feature>/`，不要放在这里。

检查所有 Override：

```bash
ruby .github/scripts/check-fork-overrides.rb --check
```

Override 必须声明 `id`、`file`、`search`、`replace` 和 `expected_count`。检查器不允许
目标缺失、匹配数量异常或静默跳过。
