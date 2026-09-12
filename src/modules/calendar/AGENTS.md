# calendar/
> L2 | 父级: /Users/xiangyun/workspace/huas-wechat-app/huas-server/src/modules/AGENTS.md

成员清单
application/: 日历订阅用例，编排签名链接、用户存续、Academic 当前学期完整采集与独立 24 小时订阅窗口
domain/: 日历纯规则，定义北京日期、周/学期 ICS UID/时区/节次/折行、URL 与响应头契约
http/: Hono 协议适配，保持 Bearer 订阅链接与公开签名 ICS 路径/错误语义
infrastructure/: HMAC、SQLite 用户/订阅快照、Academic ScheduleFacade 适配与生产 composition root
calendar.ts: Calendar canonical 公开 facade，向旧 services 路径提供稳定规则与应用函数

架构决策
Calendar 订阅固定调用 Academic 公开 ScheduleFacade.getMobileJwSemesterSchedule，逐周采集当前学期并保存完整 ICS；每用户独立 24 小时机会只由订阅回源消耗，失败也保留机会，重启不重置，其他业务及命中均不修改窗口。整学期失败保留原完整快照，无旧快照报错，不使用残缺周数据或伪造空日历；不受后台来源策略影响；Calendar 只单向依赖 Academic 公开 ScheduleFacade；application 仅通过最小 ports 使用签名、用户、课表与时钟，domain 不触及配置、数据库或网络。
旧 routes/services/auth 只允许单向再导出或委托本切片，不得保留第二套 HMAC、快照或 ICS 实现。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
