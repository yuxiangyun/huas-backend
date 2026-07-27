# jw/
> L2 | 父级: /Users/xiangyun/workspace/huas-wechat-app/huas-server/src/modules/campus-integrations/AGENTS.md

成员清单
parsers/: JW 课表、成绩、评教与空教室 HTML/混合响应的纯解析边界

架构决策
本阶段只迁移 JW 传输端点与全部 parser，Academic 用例和 PortalScheduleService 留在旧服务层并经兼容 Facade 消费 canonical 实现。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
