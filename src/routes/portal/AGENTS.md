# portal/
> L2 | 父级: /Users/xiangyun/workspace/huas-wechat-app/huas-server/src/routes/AGENTS.md

成员清单
ecard.routes.ts: 保持旧 Portal 一卡通余额合同及其 Academic refresh 桶；overview 只解析月份/刷新意图，返回余额/交易 availability 与 freshness，mobile miss/refresh 使用模块独立配额
user.routes.ts: Portal 用户资料 HTTP 适配器，强制刷新时进入共享校园 refresh 限流桶并读取、回填姓名班级
utilities.routes.ts: `/api/utilities/electricity` 电费只读适配器，仅解析身份与 refresh，并透传 nullable 电价/电量；不挂 Academic 限流，也不暴露明细/支付能力
v1-schedule.routes.ts: Portal 优先课表 HTTP 适配器，读取 startDate/endDate/refresh 参数，委托 ScheduleFacade 处理缓存与 JW 兜底，并复用上层课表日志适配器

架构决策
Portal 路由表达 Portal 优先的数据入口；JW 兜底的周课表判定下沉到 ScheduleFacade。
校园卡 overview 只接受当前月及此前 23 个自然月的单个 `YYYY-MM`，余额/交易分别投影 unavailable/stale/freshness，fatal 认证错误由应用服务决定；utilities 以 null 表示上游未提供电价/电量，不承载明细、水费、支付或凭证交接。
mobile-yxt 两条路由不消费成绩、课表、Portal 旧接口的 Academic refresh 桶；缓存 miss 与显式 refresh 均由模块自有配额保护。

开发规范
Portal token 失效、日期区间和 fallback 行为变更必须跑 business-flows 与 portal-schedule-parser 测试。

变更日志
2026-07-18: 课表路由复用 routes 层日志适配器，Portal 优先调用与 JW fallback 语义不变。
2026-06-30: v1-schedule.routes.ts 下沉双源 fallback 到 ScheduleFacade，路由只保留 HTTP 适配职责。
2026-06-30: 播种 portal 路由 L2 地图。
2026-08-23: 在不改变旧余额响应的前提下新增单月账单 overview 与 electric config/account 只读路由。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
