# portal/
> L2 | 父级: /Users/xiangyun/workspace/huas-wechat-app/huas-server/src/parsers/AGENTS.md

成员清单
ecard-parser.ts: Campus Integrations canonical 一卡通解析器的兼容再导出
portal-code.ts: Campus Integrations canonical Portal code 语义的兼容再导出
portal-schedule-parser.ts: Campus Integrations canonical Portal 课表解析器的兼容再导出
user-parser.ts: Campus Integrations canonical 用户资料解析器的兼容再导出

架构决策
本目录只保留旧路径兼容面；Portal JSON 解析实现与稳定 DTO 边界统一归入 campus-integrations/portal/parsers。

开发规范
新增字段先在解析器收口，再由 service 决定是否回写数据库。

变更日志
2026-07-27: Portal parser 唯一实现迁入 campus-integrations，本目录退化为兼容 Facade。
2026-07-16: 一卡通拒绝缺失余额；Portal 课表过滤请求日期范围外事件。
2026-07-16: Portal 课表接入共享 code 归一化，统一数字/字符串成功码与过期码。
2026-06-30: 明确 ecard-parser 拒绝 NaN 余额，金额格式异常抛出上游格式错误。
2026-06-30: 新增 portal-code.ts，统一一卡通与用户资料的 Portal code 类型和过期语义。
2026-06-30: 播种 portal parser L2 地图。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
