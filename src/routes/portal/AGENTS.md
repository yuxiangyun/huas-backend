# portal/
> L2 | 父级: /Users/xiangyun/workspace/huas-wechat-app/huas-server/src/routes/AGENTS.md

成员清单
ecard.routes.ts: Portal 一卡通 HTTP 适配器，强制刷新时进入共享校园 refresh 限流桶并读取余额数据
user.routes.ts: Portal 用户资料 HTTP 适配器，强制刷新时进入共享校园 refresh 限流桶并读取、回填姓名班级
v1-schedule.routes.ts: Portal 优先课表 HTTP 适配器，读取 startDate/endDate/refresh 参数，委托 ScheduleFacade 处理缓存与 JW 兜底，并复用上层课表日志适配器

架构决策
Portal 路由表达 Portal 优先的数据入口；JW 兜底的周课表判定下沉到 ScheduleFacade。

开发规范
Portal token 失效、日期区间和 fallback 行为变更必须跑 business-flows 与 portal-schedule-parser 测试。

变更日志
2026-07-18: 课表路由复用 routes 层日志适配器，Portal 优先调用与 JW fallback 语义不变。
2026-06-30: v1-schedule.routes.ts 下沉双源 fallback 到 ScheduleFacade，路由只保留 HTTP 适配职责。
2026-06-30: 播种 portal 路由 L2 地图。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
