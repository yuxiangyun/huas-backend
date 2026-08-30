# http/
> L2 | 父级: /src/modules/discover/AGENTS.md

成员清单
discover.routes.ts: createDiscoverRoutes(service, uploadPolicy) 注入式 Hono 工厂，在解析前限制发帖 multipart、按字段线序合并图片别名并映射帖子/评论/幂等点赞

架构决策
HTTP 层以“图片数量 × 单图上限 + 协议开销”同时限制声明长度与无长度流式请求；参数解析和协议错误留在本层，分类、内容、标签、图片、点赞与评论规则交由 application/domain。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
