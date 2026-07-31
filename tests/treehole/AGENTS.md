# treehole/
> L2 | 父级: /tests/AGENTS.md

Treehole HTTP、事务与公共作者回归按帖子、社交交互和生命周期管理拆分；顶层 `treehole.test.ts` 保持单进程装配与逐用例状态隔离。

## 成员清单

harness.ts: Treehole 共享支架，构造注入 canonical Treehole/Notifications、Community reader、SQLite、认证与用户/内容夹具
interactions.cases.ts: 社交交互用例，覆盖幂等点赞、自赞拒绝、评论回复、计数同步、统一作者与批量投影
management.cases.ts: 生命周期管理用例，覆盖作者软删除、公共作者后台视图、管理删除与参数边界
posts.cases.ts: 帖子用例，覆盖统一作者、Community 实时资料、公共用户帖子接口与列表无 N+1

## 架构决策

能力文件使用 `.cases.ts` 后缀，只由聚合入口导入，避免共享数据库和运行态被重复初始化。
业务断言留在能力文件；HTTP 装配、用户/资料夹具、批量 reader 观测和清理 hook 集中于 `harness.ts`。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
