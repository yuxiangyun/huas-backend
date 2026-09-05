# parsers/
> L2 | 父级: /Users/xiangyun/workspace/huas-wechat-app/huas-server/src/modules/campus-integrations/portal/AGENTS.md

成员清单
ecard-parser.ts: 一卡通 JSON 解析器，只接受明确成功 code 与有限余额事实，其他业务 code 抛错以进入 stale fallback
portal-code.ts: 数字/字符串 Portal code 的成功与 session expired 统一判定
portal-schedule-parser.ts: 日期课表 JSON 解析器，严格校验 data.schedule 日期映射、列表与课程，异常协议触发降级；合法空映射或空列表保留空表，date 承载具体日期、day 承载星期，weekStr 恒为空串
user-parser.ts: 用户资料 JSON 解析器，仅接受成功 code 与对象 data，其他响应抛错以进入 stale fallback

架构决策
weekStr 契约是周次文本：Portal 源没有周次即置空串，日期事实保留在独立 date 字段，禁止用星期推断跨周日期或用日期串冒充周次；Calendar 优先使用 date。
解析器只依赖稳定 DTO、错误与日志基础能力，不访问 HTTP、缓存、SQLite、Hono 或业务服务；上游不稳定字段在此窄边界归一化。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
