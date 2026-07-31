# discover/
> L2 | 父级: /Users/xiangyun/workspace/huas-wechat-app/huas-server/web/AGENTS.md

成员清单
api/discover-api.ts: `/api/discover` 元数据、帖子、评论、幂等点赞与图文写入传输边界
api/discover-cache-policy.ts: 点赞局部反馈/服务端重排与评论创建分页失效的集中缓存协调策略
api/discover-queries.ts: TanStack Query 查询和 mutation 编排，点赞先局部反馈再失效服务端排序，评论写入以失效重取维护分页
model/discover-query-keys.ts: Discover 公共/本人/指定用户帖子、详情与评论缓存键命名源
model/discover-types.ts: Discover 分类、帖子、评论、分页与写入响应的前端契约

架构决策
`popular` 与 `recommended` 的顺序由服务端拥有；点赞 mutation 可局部更新计数，但必须失效公共列表以重算跨帖排序和推荐偏好。
评论按创建时间升序且使用 offset 人工分页；创建或删除后统一失效评论查询，不在未完整加载的客户端分页尾部伪造位置。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
