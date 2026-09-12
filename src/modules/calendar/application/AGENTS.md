# application/
> L2 | 父级: /Users/xiangyun/workspace/huas-wechat-app/huas-server/src/modules/calendar/AGENTS.md

成员清单
calendar.ports.ts: Calendar 最小外部能力契约，隔离用户存储、HMAC、Academic 周/学期课表、持久订阅快照及同用户合流与系统时钟
calendar-subscription.service.ts: 订阅链接与公开 ICS 用例，移动教务整学期快照与每用户 24 小时订阅专属窗口，先保存机会再采集，失败保留旧 ICS；旧周查询仅作兼容且不参与窗口

架构决策
application 只编排订阅用例，不直接引用数据库、Academic 实现、config、旧 auth/services/routes Facade。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
