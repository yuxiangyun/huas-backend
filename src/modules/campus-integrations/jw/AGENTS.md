# jw/
> L2 | 父级: /Users/xiangyun/workspace/huas-wechat-app/huas-server/src/modules/campus-integrations/AGENTS.md

成员清单
parsers/: JW 课表、成绩、评教与空教室 HTML/混合响应的纯解析边界

架构决策
JW 传输端点与 parser 由本防腐层持有；Academic 用例通过具名端口读取 SchoolAccess 解析结果；纯 parser 保留协议规则，本模块不反向知道学业编排。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
