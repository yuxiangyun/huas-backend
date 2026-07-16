# admin/
> L2 | 父级: /Users/xiangyun/workspace/huas-wechat-app/huas-server/src/services/AGENTS.md

成员清单
analytics-service.ts: 渠道每日指标服务，以显式渠道头记录去重活跃、登录、功能调用与错误事实，并仅为真正缺失渠道头的旧版小程序保留校园核心接口兼容
dashboard-service.ts: 管理仪表盘服务，聚合用户活跃、公告、Discover、Treehole 统计
terminal-log-service.ts: 终端日志服务，从日志文件读取、过滤并限制返回条数

架构决策
admin 服务聚合业务事实；analytics-service 只持久化不可从业务表还原的渠道化访问事实。渠道与功能是正交维度：显式请求头决定渠道，路径只识别功能；历史 unknown 原样保留，不回填、不推算。

开发规范
新增统计字段必须说明数据来源表或文件，避免隐式扫描高成本资源。

变更日志
2026-07-16: 旧小程序 fallback 收紧为仅渠道头真正缺失；空白、unknown 与非法显式值保持 unknown。
2026-07-16: 渠道与功能解耦，显式请求头成为渠道真相；仅无头校园核心接口兼容旧版小程序，历史 unknown 原样保留。
2026-07-12: 核心功能按业务语义收口：小程序为课表、成绩评教、一卡通、空教室、日历，Web 为 Discover、Treehole。
2026-07-12: 新增轻量渠道分析事实服务，为小程序、Web 与未知来源提供统一趋势口径。
2026-06-30: 播种 admin 服务 L2 地图。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
