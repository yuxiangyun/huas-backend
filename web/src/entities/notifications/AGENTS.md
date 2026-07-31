# notifications/
> L2 | 父级: /Users/xiangyun/workspace/huas-wechat-app/huas-server/web/AGENTS.md

成员清单
api/notification-api.ts: `/api/notifications` 普通分页、ID 高水位增量、未读/总量摘要与逐条已读传输边界
api/notification-queries.ts: TanStack Query 通知列表、高水位、摘要与逐条已读 mutation 编排
model/notification-query-keys.ts: 通知列表、增量与未读查询键命名源
model/notification-reconciliation.ts: 比较列表 total 与摘要 total，决定是否执行撤销删除后的快照校准
model/notification-types.ts: 六类活动通知、资源引用、普通分页、增量和未读/总量摘要响应契约

架构决策
活动通知与私信未读保持独立缓存；通知点击后逐条已读并深链到原内容，不提供服务端不存在的“全部已读”。
普通列表只用于人工翻页；notificationId 高水位发现新增，摘要 total 变化触发一次快照校准以删除已撤销通知。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
