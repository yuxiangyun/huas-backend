# application/
> L2 | 父级: /Users/xiangyun/workspace/huas-wechat-app/huas-server/src/modules/calendar/AGENTS.md

成员清单
calendar.ports.ts: Calendar 最小外部能力契约，隔离用户存储、HMAC、Academic 课表与系统时钟
calendar-subscription.service.ts: 订阅链接与公开 ICS 用例，保持移动教务固定单源及同源 stale 兜底和 15 分钟周快照刷新

架构决策
application 只编排订阅用例，不直接引用数据库、Academic 实现、config、旧 auth/services/routes Facade。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
