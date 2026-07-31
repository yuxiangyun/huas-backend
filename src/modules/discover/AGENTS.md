# discover/
> L2 | 父级: /src/modules/AGENTS.md

成员清单
application/: Discover 用例编排层，仅依赖 domain ports 与规则
domain/: Discover 稳定 DTO、校验/分页规则、persistence/media ports 与 Operations 管理只读查询契约
http/: Discover Hono 协议适配器，以 createDiscoverRoutes(service) 工厂暴露 /api/discover 路由
infrastructure/: 构造注入的 SQLite 查询/事务、Operations 点赞快照与本地图片生命周期 adapters
composition.ts: 局部模块组合根，接收 db/CommunityProfileReader/Notifications Outbox 与投影 ports，并返回 service、routes、media 与 Operations query 实例

架构决策
依赖方向固定为 http → application → domain ports；composition 只组装本模块实例，application 不感知 Drizzle、Bun、Community 具体实现或文件系统。
点赞事实与 likeCount/Outbox、评论事实与 commentCount/Outbox 的一致性由 SQLite 短事务维护；发帖失败媒体补偿、提交后即时投影与软删除后媒体清理由 application 编排。
帖子、评论与 Operations 查询只读取 Discover 自有事实，再经 CommunityProfileReader.getMany 批量投影作者，禁止 JOIN users/community_profiles。
推荐偏好仅来源于当前用户点赞过帖子的分类与标签；无点赞偏好或无匹配候选时退化 latest，popular 固定按 likeCount、publishedAt、id 排序。

变更日志
2026-07-31: 删除评分与静态 singleton，加入幂等点赞、popular/点赞偏好推荐、公共用户帖子和 Community 批量作者投影。
2026-07-29: Discover 帖子与评论接入共享社区昵称/头像，保留无昵称时的既有同学标签。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
