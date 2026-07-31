# http/
> L2 | 父级: /src/modules/discover/AGENTS.md

成员清单
discover.routes.ts: createDiscoverRoutes(service) 注入式 Hono 工厂，解析帖子、评论及返回 `{postId, liked, likeCount}` 的 PUT/DELETE 幂等点赞

架构决策
HTTP 层保留参数解析和协议错误；分类、内容、标签、图片、点赞与评论规则交由 application/domain，不持有模块 singleton。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
