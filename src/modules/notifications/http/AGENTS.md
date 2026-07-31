# http/
> L2 | 父级: /src/modules/notifications/AGENTS.md

成员清单
notification.routes.ts: createNotificationRoutes 注入式 Hono factory，提供活动通知 offset 普通翻页、ID 增量轮询、未读/总量摘要与单条 PUT 已读

架构决策
HTTP adapter 将 `/changes` 的 afterNotificationId 作为非负高水位并与普通翻页隔离；`/unread-count` 同时返回 recipient 自身 total 供撤销校准，已读接口仍由 repository 约束 recipient。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
