# discover/
> L2 | 父级: /Users/xiangyun/workspace/huas-wechat-app/huas-server/tests/AGENTS.md

Discover 端到端业务回归按媒体、推荐、评论和管理合规读模型拆分；顶层 `discover.test.ts` 负责在单进程中装配，共享同一 HTTP 支架与逐用例数据库清理。

## 成员清单

comments.cases.ts: 评论生命周期用例，覆盖分页回复、父评论约束、作者删除、计数同步与帖子删除后的可见性
feed.cases.ts: 评分推荐用例，覆盖评分聚合、高分排序、冷启动以及自身和已评分内容排除规则
harness.ts: Discover 共享支架，装配路由、SQLite、JWT、图片夹具、后台会话与 UGC 运行态重置
media.cases.ts: 媒体摄取用例，覆盖标准图片、HEIF/HEIC、旧限制以上大图与 animated WebP 规范化
operations.cases.ts: 管理合规用例，覆盖后台删除、默认拒绝、媒体失效与 UGC 合规模式热切换

## 架构决策

能力文件使用 `.cases.ts` 后缀，只由聚合入口导入，避免被测试调度器当成独立数据库套件。
业务断言留在能力文件；应用装配、媒体夹具和状态清理集中于 `harness.ts`，保证每个用例仍拥有原有隔离边界。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
