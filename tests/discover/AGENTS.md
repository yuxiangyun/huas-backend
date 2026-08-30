# discover/
> L2 | 父级: /tests/AGENTS.md

Discover 端到端业务回归按媒体、点赞推荐、评论和 Operations 读模型拆分；顶层 `discover.test.ts` 负责在单进程中装配，共享同一 HTTP 支架与逐用例数据库清理。

## 成员清单

comments.cases.ts: 评论生命周期用例，覆盖统一作者投影、分页回复、父评论约束、作者删除、计数同步与帖子删除后的可见性
feed.cases.ts: 匿名只读与 PUT/DELETE 点赞推荐用例，覆盖公共路由白名单、匿名 viewer 投影、幂等/作者自赞、popular、推荐分页与统一作者 DTO
harness.ts: Discover 共享支架，分别装配匿名只读与认证 canonical routes，并组合 Notifications、Community、SQLite、JWT 与图片夹具
media.cases.ts: 媒体摄取用例，覆盖混合字段线序、标准图片、HEIF/HEIC、旧限制以上大图、animated WebP 规范化与孤儿回收
operations.cases.ts: Operations 端口用例，覆盖帖子/点赞快照、无跨域装配的管理删除与媒体失效

## 架构决策

能力文件使用 `.cases.ts` 后缀，只由聚合入口导入，避免被测试调度器当成独立数据库套件。
业务断言留在能力文件；应用装配、资料投影、媒体夹具和状态清理集中于 `harness.ts`，根 composition 的跨域集成由独立阶段验证。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
