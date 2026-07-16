# portal/
> L2 | 父级: /Users/xiangyun/workspace/huas-wechat-app/huas-server/src/parsers/AGENTS.md

成员清单
ecard-parser.ts: Portal 一卡通 JSON 解析器，仅接受明确余额字段，缺失或格式异常抛出 INTERNAL_ERROR
portal-code.ts: Portal code 语义收口，统一数字/字符串成功码与过期码判断
portal-schedule-parser.ts: Portal 课表 JSON 解析器，复用共享 code 语义并过滤请求范围外日期
user-parser.ts: Portal 用户资料 JSON 解析器，输出学号、姓名、班级等资料

架构决策
Portal JSON 入口允许使用窄 any 边界接住上游不稳定字段，但输出必须是内部稳定 DTO。

开发规范
新增字段先在解析器收口，再由 service 决定是否回写数据库。

变更日志
2026-07-16: 一卡通拒绝缺失余额；Portal 课表过滤请求日期范围外事件。
2026-07-16: Portal 课表接入共享 code 归一化，统一数字/字符串成功码与过期码。
2026-06-30: 明确 ecard-parser 拒绝 NaN 余额，金额格式异常抛出上游格式错误。
2026-06-30: 新增 portal-code.ts，统一一卡通与用户资料的 Portal code 类型和过期语义。
2026-06-30: 播种 portal parser L2 地图。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
