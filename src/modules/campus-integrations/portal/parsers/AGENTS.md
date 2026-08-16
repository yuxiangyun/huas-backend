# parsers/
> L2 | 父级: /Users/xiangyun/workspace/huas-wechat-app/huas-server/src/modules/campus-integrations/portal/AGENTS.md

成员清单
ecard-parser.ts: 一卡通 JSON 解析器，只接受明确成功 code 与有限余额事实，其他业务 code 抛错以进入 stale fallback
portal-code.ts: 数字/字符串 Portal code 的成功与 session expired 统一判定
portal-schedule-parser.ts: 日期课表 JSON 解析器，保留空数据语义并过滤请求范围外事件；weekStr 恒为空串（Portal 无周次文本，日期由 day 承载）
user-parser.ts: 用户资料 JSON 解析器，仅接受成功 code 与对象 data，其他响应抛错以进入 stale fallback

架构决策
weekStr 契约是周次文本：Portal 源没有周次即置空串，日期事实经 day + 周一起始区间推导，禁止用日期串冒充周次（日历 ICS 的 resolveCourseDate 回退分支与之等价）。
解析器只依赖稳定 DTO、错误与日志基础能力，不访问 HTTP、缓存、SQLite、Hono 或业务服务；上游不稳定字段在此窄边界归一化。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
