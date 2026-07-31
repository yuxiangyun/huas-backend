# http/
> L2 | 父级: /src/modules/operations/AGENTS.md

成员清单
admin-session.middleware.ts: 后台 HttpOnly Cookie 会话建立、探测、空闲续期与撤销边界
admin.routes.ts: createAdminRoutes 注入式后台路由工厂，承载 dashboard、社区、Messaging 会话增量/三态只读历史审计与 Academic 策略协议
health.routes.ts: 保持 `/health` 兼容响应，并提供 `/health/live` 与本地依赖 `/health/ready`
metrics.routes.ts: `/metrics` Prometheus 文本适配器，只序列化进程内低基数运行指标
public.routes.ts: `/api/public/announcements` 匿名公告读取 HTTP 适配器

架构决策
http 只负责 Hono 输入/响应、Cookie、参数错误与审计日志；管理聚合调用构造注入的 application，文件和数据库细节不得上浮。
跨领域运维命令只调用根组合注入的公开应用端口；Messaging 管理面只有 Cookie 保护的 GET 会话/增量、三态消息与私有媒体，每次成功读取只审计管理员、conversationId/稳定媒体键和操作类型。
健康与指标端点不得探测校园上游，也不得扫描业务事实表。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
