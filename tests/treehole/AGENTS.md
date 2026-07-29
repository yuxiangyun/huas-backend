# treehole/
> L2 | 父级: /Users/xiangyun/workspace/huas-wechat-app/huas-server/tests/AGENTS.md

Treehole HTTP、事务与头像媒体回归按帖子头像、社交交互、生命周期管理和合规读模型拆分；顶层 `treehole.test.ts` 保持单进程装配与逐用例状态隔离。

## 成员清单

compliance.cases.ts: 合规读模型用例，覆盖 ASN/端口来源命中、空态、写入放行、热切换与恢复
harness.ts: Treehole 共享支架，装配路由、SQLite、JWT、头像夹具、后台会话与 UGC 配置重置
interactions.cases.ts: 社交交互用例，覆盖幂等点赞、个人列表、评论回复、计数同步与通知已读
management.cases.ts: 生命周期管理用例，覆盖作者软删除、真实作者后台视图、管理删除与参数边界
posts-avatar.cases.ts: 社区资料用例，覆盖化名读模型、昵称规则、头像上传删除、跨读模型同步与文件格式校验

## 架构决策

能力文件使用 `.cases.ts` 后缀，只由聚合入口导入，避免共享数据库和运行态被重复初始化。
业务断言留在能力文件；HTTP 装配、用户夹具、头像夹具和清理 hook 集中于 `harness.ts`。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
