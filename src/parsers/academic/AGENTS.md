# academic/
> L2 | 父级: /Users/xiangyun/workspace/huas-wechat-app/huas-server/src/parsers/AGENTS.md

成员清单
classroom-free-parser.ts: Campus Integrations canonical 空教室解析器的兼容再导出
evaluation-parser.ts: Campus Integrations canonical 评教解析函数、类型与常量的兼容再导出
grade-parser.ts: Campus Integrations canonical 成绩解析器的兼容再导出
schedule-parser.ts: Campus Integrations canonical 课表解析器的兼容再导出

架构决策
本目录只保留旧路径兼容面，所有实现单向归入 campus-integrations/jw/parsers。

开发规范
每个新增上游页面分支都必须有 fixture 覆盖；发现三个以上特殊分支时优先沉淀结构化 helper。

变更日志
2026-07-27: JW parser 唯一实现迁入 campus-integrations，本目录退化为兼容 Facade。
2026-07-16: 从评教服务抽出无状态 URL、列表、表单与提交页解析规则，恢复 parser/service 单向边界。
2026-07-16: 成绩拒绝无 dataList 错误页；课表只解析最外层课程节点，避免 div/p 重复。
2026-06-30: 成绩解析先判失败词再判通过词，避免“不及格/不通过/未通过”被子串误判为通过。
2026-06-30: 播种 academic parser L2 地图。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
