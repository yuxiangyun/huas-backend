# notifications/
> L2 | 父级: /Users/xiangyun/workspace/huas-wechat-app/huas-server/web/AGENTS.md

成员清单
api/notification-api.ts: `/api/notifications` 普通分页、ID 高水位增量、未读计数与逐条已读传输边界
api/notification-queries.ts: TanStack Query 通知读模型与逐条已读 mutation 编排
model/notification-query-keys.ts: 通知列表、增量与未读查询键命名源
model/notification-types.ts: 六类活动通知、资源引用、普通分页和增量响应契约

架构决策
活动通知与私信未读保持独立缓存；通知点击后逐条已读并深链到原内容，不提供服务端不存在的“全部已读”。
普通列表只用于人工翻页，后台刷新使用 notificationId 高水位增量协议。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
