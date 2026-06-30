# admin/
> L2 | 父级: /Users/xiangyun/workspace/huas-wechat-app/huas-server/src/services/AGENTS.md

成员清单
dashboard-service.ts: 管理仪表盘服务，聚合用户活跃、公告、Discover、Treehole 统计
terminal-log-service.ts: 终端日志服务，从日志文件读取、过滤并限制返回条数

架构决策
admin 服务只聚合已有事实，不成为新的业务真相源。

开发规范
新增统计字段必须说明数据来源表或文件，避免隐式扫描高成本资源。

变更日志
2026-06-30: 播种 admin 服务 L2 地图。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
