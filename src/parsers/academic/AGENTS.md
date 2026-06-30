# academic/
> L2 | 父级: /Users/xiangyun/workspace/huas-wechat-app/huas-server/src/parsers/AGENTS.md

成员清单
classroom-free-parser.ts: 空教室 HTML/JSON 混合解析器，提取楼栋、教室容量、周次与节次空闲状态
grade-parser.ts: JW 成绩 HTML 解析器，失败词优先判定 passStatus，识别评教未完成阻断并输出成绩 DTO
schedule-parser.ts: JW 课表 HTML 解析器，输出统一课程模型并识别非教学周与 session 过期

架构决策
教务解析器承认上游页面不稳定，优先做窄输入解析和明确错误，不在此层做缓存或重试。

开发规范
每个新增上游页面分支都必须有 fixture 覆盖；发现三个以上特殊分支时优先沉淀结构化 helper。

变更日志
2026-06-30: 成绩解析先判失败词再判通过词，避免“不及格/不通过/未通过”被子串误判为通过。
2026-06-30: 播种 academic parser L2 地图。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
