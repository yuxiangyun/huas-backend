# infrastructure/
> L2 | 父级: /src/modules/discover/AGENTS.md

成员清单
discover-mapping.ts: Discover 自有事实的 Drizzle selector、数据库/事务类型与领域映射再导出，不含跨域 join
discover-media-service.ts: 共享 image 转换器与本地文件系统媒体 adapter，按注入 db 校验帖子可见性
sqlite-discover-comment-service.ts: 构造注入的评论创建/删除、Community 批量作者投影与父作者 reply/帖子作者 comment 差异 Outbox 事务实现
sqlite-discover-persistence.ts: 持有帖子/评论/推荐实例图的 DiscoverPersistence 聚合 adapter
sqlite-discover-operations-query.ts: 构造注入的帖子/点赞管理快照 adapter，经 CommunityProfileReader 批量投影作者
sqlite-discover-post-service.ts: 帖子/用户帖子查询、popular 排序、点赞事实/计数/Outbox 原子写入与批量作者投影实现
sqlite-discover-recommendation-service.ts: 基于点赞分类/标签的偏好排序、latest 退化与分页实现

架构决策
全部 adapter 以实例协作并构造注入 db；DiscoverPostQuery 只在 infrastructure 内复用，评论和推荐不得反向依赖 application。
帖子/评论查询不得 JOIN users/community_profiles；先取得自身事实，再调用 CommunityProfileReader.getMany 一次批量投影作者。互动事务只经注入的 Notifications writer 写 Outbox，Bun SQLite 事务 callback 必须同步且提交前不得执行投影。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
