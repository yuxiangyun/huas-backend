# http/
> L2 | 父级: /src/modules/messaging/AGENTS.md

成员清单
messaging.routes.ts: createMessagingRoutes 注入式 Hono factory，提供会话/增量消息/未读/已读、必需 Idempotency-Key 发送与参与者鉴权媒体读取

架构决策
路由由上层统一 Bearer 认证；成功增量轮询可由全局日志中间件静默，发送/已读仍记录对象 ID 与数量，永不写入正文、文件名或二进制内容。
私信媒体不挂公开 `/media/*`；文件响应前必须由 Messaging 自有事实证明当前用户是会话参与者，且敏感响应使用 `private, no-store`。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
