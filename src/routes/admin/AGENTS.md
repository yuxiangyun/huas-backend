# admin/
> L2 | 父级: /Users/xiangyun/workspace/huas-wechat-app/huas-server/src/routes/AGENTS.md

成员清单
admin.routes.ts: Cookie 会话管理面 HTTP 适配器，聚合 dashboard、公告、日志、Discover、Treehole 管理操作与 UGC 合规模式热开关

架构决策
管理路由只处理 Cookie 会话、参数解析、运行策略、错误包装和审计日志；统计、公告和社区管理事实由各 service 维护。

开发规范
新增管理接口必须保留后台会话中间件保护，并记录有审计价值的操作日志。

变更日志
2026-07-12: 新增后台会话建立、探测与撤销接口，管理 API 改用 HttpOnly Cookie 鉴权。
2026-07-01: 新增 /api/admin/compliance/ugc，后台热控制 UGC normal/compliance 模式与分域纯文本 mock。
2026-06-30: 播种 admin 路由 L2 地图。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
