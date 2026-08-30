# http/
> L2 | 父级: /src/modules/discover/AGENTS.md

成员清单
discover.routes.ts: `createPublicDiscoverRoutes`/`createDiscoverRoutes` 注入式 Hono 工厂，共享元数据/Feed/详情/评论读取 handler，公开表固定匿名 viewer，认证表另映射受 multipart 门禁保护的发帖与全部互动

架构决策
HTTP 层以“图片数量 × 单图上限 + 协议开销”同时限制声明长度与无长度流式请求；参数解析和协议错误留在本层，分类、内容、标签、图片、点赞与评论规则交由 application/domain。
公开与认证路由使用两张物理路由表；匿名 viewer 只影响 `likedByMe/isMine` 投影，不得通过可选身份中间件扩大公开端点集合。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
