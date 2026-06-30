# system/
> L2 | 父级: /Users/xiangyun/workspace/huas-wechat-app/huas-server/src/routes/AGENTS.md

成员清单
health.routes.ts: 健康检查 HTTP 适配器，输出进程状态并执行 SQLite SELECT 1

架构决策
健康检查只暴露运行态和数据库连通性，不触发学校上游请求。

开发规范
新增健康项必须轻量、可超时、不得依赖外部学校服务。

变更日志
2026-06-30: 播种 system 路由 L2 地图。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
