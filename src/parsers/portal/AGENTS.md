# portal/
> L2 | 父级: /Users/xiangyun/workspace/huas-wechat-app/huas-server/src/parsers/AGENTS.md

成员清单
ecard-parser.ts: Portal 一卡通 JSON 解析器，输出稳定余额 DTO，金额格式异常抛出 INTERNAL_ERROR
portal-code.ts: Portal code 语义收口，统一数字/字符串成功码与过期码判断
portal-schedule-parser.ts: Portal 课表 JSON 解析器，把日期课表适配为统一课程模型
user-parser.ts: Portal 用户资料 JSON 解析器，输出学号、姓名、班级等资料

架构决策
Portal JSON 入口允许使用窄 any 边界接住上游不稳定字段，但输出必须是内部稳定 DTO。

开发规范
新增字段先在解析器收口，再由 service 决定是否回写数据库。

变更日志
2026-06-30: 明确 ecard-parser 拒绝 NaN 余额，金额格式异常抛出上游格式错误。
2026-06-30: 新增 portal-code.ts，统一一卡通与用户资料的 Portal code 类型和过期语义。
2026-06-30: 播种 portal parser L2 地图。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
