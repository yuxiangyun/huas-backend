# infrastructure/
> L2 | 父级: /Users/xiangyun/workspace/huas-wechat-app/huas-server/src/modules/calendar/AGENTS.md

成员清单
academic-schedule.adapter.ts: Academic canonical ScheduleFacade 适配，保持 Portal-first/JW fallback 而不反向污染 Academic
calendar-composition.ts: Calendar 生产 composition root，注入 HMAC、SQLite、Academic、时钟与运行配置
hmac-calendar-signature.ts: studentId 标准化与 SHA-256 HMAC canonical 实现，使用 timing-safe 校验
sqlite-calendar-user.reader.ts: SQLite 订阅用户投影适配，只返回 Calendar 所需 id/studentId/name

架构决策
infrastructure 是 Calendar 唯一允许知道 SQLite、config 和 Academic 实现的层；composition root 只装配，不复制业务规则。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
