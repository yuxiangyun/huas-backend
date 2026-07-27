# parsers/
> L2 | 父级: /Users/xiangyun/workspace/huas-wechat-app/huas-server/src/modules/campus-integrations/portal/AGENTS.md

成员清单
ecard-parser.ts: 一卡通 JSON 解析器，只接受明确且有限的余额事实
portal-code.ts: 数字/字符串 Portal code 的成功与 session expired 统一判定
portal-schedule-parser.ts: 日期课表 JSON 解析器，保留空数据语义并过滤请求范围外事件
user-parser.ts: 用户资料 JSON 解析器，输出稳定身份、班级与组织 DTO

架构决策
解析器只依赖稳定 DTO、错误与日志基础能力，不访问 HTTP、缓存、SQLite、Hono 或业务服务；上游不稳定字段在此窄边界归一化。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
