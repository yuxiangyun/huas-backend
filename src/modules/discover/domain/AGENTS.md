# domain/
> L2 | 父级: /src/modules/discover/AGENTS.md

成员清单
discover.ts: Discover 帖子/评论/点赞 DTO、分类/标签常量、Unicode code point 校验/分页规则与 CommunityProfile 响应映射纯函数
ports.ts: 帖子、用户帖子、点赞、评论持久化与含孤儿回收能力的媒体存储两个真实外部边界契约
operations-query.ts: 面向 Operations 的帖子/点赞汇总与最新管理列表只读契约

架构决策
domain 不依赖 Hono、Drizzle、Bun 或 Node 文件系统；公开作者直接复用 CommunityProfile，运行时限制通过 DiscoverPolicy 传入。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
