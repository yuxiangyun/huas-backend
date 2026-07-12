# admin/
> L2 | 父级: /Users/xiangyun/workspace/huas-wechat-app/huas-server/src/services/AGENTS.md

成员清单
analytics-service.ts: 渠道每日指标服务，记录去重活跃用户、登录、核心功能请求与错误事实并生成时间序列
dashboard-service.ts: 管理仪表盘服务，聚合用户活跃、公告、Discover、Treehole 统计
terminal-log-service.ts: 终端日志服务，从日志文件读取、过滤并限制返回条数

架构决策
admin 服务聚合业务事实；analytics-service 只持久化不可从业务表还原的渠道化访问事实。

开发规范
新增统计字段必须说明数据来源表或文件，避免隐式扫描高成本资源。

变更日志
2026-07-12: 新增轻量渠道分析事实服务，为小程序、Web 与未知来源提供统一趋势口径。
2026-06-30: 播种 admin 服务 L2 地图。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
