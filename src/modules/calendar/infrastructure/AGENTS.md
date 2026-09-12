# infrastructure/
> L2 | 父级: /Users/xiangyun/workspace/huas-wechat-app/huas-server/src/modules/calendar/AGENTS.md

成员清单
academic-schedule.adapter.ts: Academic canonical ScheduleFacade 适配，委托移动教务完整学期采集及旧周查询，不反向污染 Academic
calendar-composition.ts: Calendar 生产 composition root，注入 HMAC、SQLite 用户及持久订阅快照、Academic、时钟与运行配置
calendar-snapshot.store.ts: canonical Cache adapter，每用户单键保存最近完整 ICS 与采集开始时间，永久 TTL 支持跨重启窗口，进程内同键合流隔离重复订阅
hmac-calendar-signature.ts: studentId 标准化与 SHA-256 HMAC canonical 实现，使用 timing-safe 校验
sqlite-calendar-user.reader.ts: SQLite 订阅用户投影适配，只返回 Calendar 所需 id/studentId/name

架构决策
infrastructure 是 Calendar 唯一允许知道 SQLite、config 和 Academic 实现的层；composition root 只装配，不复制业务规则。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
