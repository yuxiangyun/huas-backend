# application/
> L2 | 父级: /src/modules/discover/AGENTS.md

成员清单
discover-application-service.ts: 构造注入 persistence/media ports 与活动投影触发器，编排帖子、用户帖子、点赞、评论、推荐、提交后即时投影、补偿删除与管理删除用例

架构决策
application 只依赖 domain、Notifications 窄触发端口与共享错误/日志门面；SQLite、媒体和投影实现只能由上层 composition 注入。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
