# http/
> L2 | 父级: /src/modules/notifications/AGENTS.md

成员清单
notification.routes.ts: createNotificationRoutes 注入式 Hono factory，提供活动通知分页、未读计数与单条 PUT 已读

架构决策
HTTP adapter 只解析当前认证用户、正整数分页和通知 ID；已读接口由 repository 同时约束 recipient，不提供全部已读、活动 Toast 或私信通知混写。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
