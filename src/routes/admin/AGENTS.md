# admin/
> L2 | 父级: /Users/xiangyun/workspace/huas-wechat-app/huas-server/src/routes/AGENTS.md

成员清单
admin.routes.ts: Basic Auth 管理面 HTTP 适配器，聚合 dashboard、公告、日志、Discover 与 Treehole 管理操作

架构决策
管理路由只处理 Basic Auth、参数解析、错误包装和审计日志；统计、公告和社区管理事实由各 service 维护。

开发规范
新增管理接口必须保留 Basic Auth 中间件保护，并记录有审计价值的操作日志。

变更日志
2026-06-30: 播种 admin 路由 L2 地图。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
