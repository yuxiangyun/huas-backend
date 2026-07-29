# infrastructure/
> L2 | 父级: /Users/xiangyun/workspace/huas-wechat-app/huas-server/src/modules/discover/AGENTS.md

成员清单
discover-mapping.ts: Drizzle selector、社区昵称/头像 join、分页边界与 SQLite 行到 API DTO 的兼容映射
discover-media-service.ts: sharp/heic-convert 与本地文件系统媒体 adapter，并按帖子可见性公开读取
sqlite-discover-comment-service.ts: 评论创建/删除与 commentCount 同事务实现
sqlite-discover-persistence.ts: application 所见的单一 DiscoverPersistence SQLite adapter
sqlite-discover-operations-query.ts: DiscoverOperationsQueryPort 的 SQLite adapter，封装帖子/评分计数、作者 join 与存储 JSON 映射
sqlite-discover-post-service.ts: 帖子查询、列表、评分事务与 infrastructure 内部 DiscoverPostQuery
sqlite-discover-recommendation-service.ts: 偏好权重、候选合并、冷启动时间流与分页实现

架构决策
DiscoverPostQuery 只在 infrastructure 内复用，评论和推荐不得反向依赖 application；社区资料从 users 动态 join，不复制到帖子/评论事实表。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
