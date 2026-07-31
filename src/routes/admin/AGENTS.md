# admin/
> L2 | 父级: /src/routes/AGENTS.md

成员清单
admin.routes.ts: Operations createAdminRoutes 工厂的单向兼容再导出，不持有生产路由实例

架构决策
管理 HTTP canonical 实现位于 Operations；本目录不得恢复业务逻辑或反向承载管理事实。

开发规范
新增管理接口必须保留后台会话中间件保护，并记录有审计价值的操作日志。

变更日志
2026-07-27: 管理 HTTP 迁入 Operations，本文件退化为单向兼容 Facade。
2026-07-12: 新增后台会话建立、探测与撤销接口，管理 API 改用 HttpOnly Cookie 鉴权。
2026-06-30: 播种 admin 路由 L2 地图。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
