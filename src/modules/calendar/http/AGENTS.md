# http/
> L2 | 父级: /Users/xiangyun/workspace/huas-wechat-app/huas-server/src/modules/calendar/AGENTS.md

成员清单
calendar-api.routes.ts: Bearer `/api/calendar/link` 协议映射，将认证 studentId 交给链接用例
calendar-public.routes.ts: 公开 `/calendar/schedule.ics` 协议映射，保持参数、状态、错误体与 ICS 响应头

架构决策
http 只负责 Hono 输入与输出；签名、用户查询、课表刷新和 ICS 构造均由应用层编排。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
