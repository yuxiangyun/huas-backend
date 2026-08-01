# discover/
> L2 | 父级: /Users/xiangyun/workspace/huas-wechat-app/huas-server/web/AGENTS.md

成员清单
api/discover-api.ts: `/api/discover` 元数据、帖子、评论、幂等点赞与图文写入传输边界
api/discover-cache-policy.ts: 点赞原位乐观/服务端确认与评论创建分页失效的集中缓存协调策略
api/discover-queries.ts: TanStack Query 查询和 mutation 编排，Feed 使用共享 60 秒新鲜度/15 分钟回访缓存、元数据使用 6 小时引用策略，点赞原位乐观且不立即重排，评论写入失效重取分页
model/discover-query-keys.ts: Discover 公共/本人/指定用户帖子、详情与评论缓存键命名源
model/discover-types.ts: Discover 分类、帖子、评论、分页与写入响应的前端契约

架构决策
`popular` 与 `recommended` 的顺序由服务端拥有；点赞 mutation 先原位更新计数且不主动失效当前时间线，用户刷新或缓存自然重取时才应用服务端新排序。
评论按创建时间升序且使用 offset 人工分页；创建或删除后统一失效评论查询，不在未完整加载的客户端分页尾部伪造位置。
公共列表在排序或分类查询键切换时使用上一份成功数据作短暂占位，控件负责呈现后台刷新态，避免整棵信息流被骨架替换造成布局跳动。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
