# domain/
> L2 | 父级: /Users/xiangyun/workspace/huas-wechat-app/huas-server/src/modules/discover/AGENTS.md

成员清单
discover.ts: Discover DTO、社区资料投影、分类/标签常量、校验/分页规则与响应映射纯函数
ports.ts: 持久化与媒体存储两个真实外部边界契约
operations-query.ts: 面向 Operations 的帖子/评分汇总与最新管理列表只读契约

架构决策
domain 不依赖 Hono、Drizzle、Bun 或 Node 文件系统；运行时限制通过 DiscoverPolicy 传入，避免配置反向污染稳定规则。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
