# workflows/
> L2 | 父级: /AGENTS.md

成员清单
check.yml: main 分支 push/PR 与手动触发的单 job Bun 质量门，执行冻结安装与 `bun run check`

架构决策
CI 只维护一条确定性质量链路，不使用版本矩阵；同一分支的新运行会取消旧运行，避免重复消耗资源。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
