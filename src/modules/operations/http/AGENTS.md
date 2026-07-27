# http/
> L2 | 父级: /Users/xiangyun/workspace/huas-wechat-app/huas-server/src/modules/operations/AGENTS.md

成员清单
admin-session.middleware.ts: 后台 HttpOnly Cookie 会话建立、探测、空闲续期与撤销边界
admin.routes.ts: 后台 dashboard、analytics、公告、日志、UGC 与社区管理 HTTP 适配器
health.routes.ts: `/health` 进程状态与 SQLite 连通性 HTTP 适配器
public.routes.ts: `/api/public/announcements` 匿名公告读取 HTTP 适配器

架构决策
http 只负责 Hono 输入/响应、Cookie、参数错误与审计日志；管理聚合调用构造注入的 application，文件和数据库细节不得上浮。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
