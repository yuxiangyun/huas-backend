# admin/
> L2 | 父级: /Users/xiangyun/workspace/huas-wechat-app/huas-server/src/services/AGENTS.md

成员清单
analytics-service.ts: Operations canonical 批量 analytics 服务的单向兼容 Facade
dashboard-service.ts: Operations canonical Dashboard application 的单向兼容 Facade
terminal-log-service.ts: Operations canonical 终端日志服务的单向兼容 Facade

架构决策
管理 canonical 实现位于 Operations；旧 Facade 不承载查询、文件或数据库逻辑。analytics 请求内只聚合事实，短周期批量持久化由 canonical 服务负责。

开发规范
新增统计字段必须说明数据来源表或文件，避免隐式扫描高成本资源。

变更日志
2026-07-27: Dashboard、analytics 与终端日志迁入 Operations，本目录退化为单向 Facade。
2026-07-16: 旧小程序 fallback 收紧为仅渠道头真正缺失；空白、unknown 与非法显式值保持 unknown。
2026-07-16: 渠道与功能解耦，显式请求头成为渠道真相；仅无头校园核心接口兼容旧版小程序，历史 unknown 原样保留。
2026-07-12: 核心功能按业务语义收口：小程序为课表、成绩评教、一卡通、空教室、日历，Web 为 Discover、Treehole。
2026-07-12: 新增轻量渠道分析事实服务，为小程序、Web 与未知来源提供统一趋势口径。
2026-06-30: 播种 admin 服务 L2 地图。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
