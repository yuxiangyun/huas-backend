# parsers/
> L2 | 父级: /Users/xiangyun/workspace/huas-wechat-app/huas-server/src/modules/campus-integrations/jw/AGENTS.md

成员清单
classroom-free-parser.ts: 空教室 HTML/JSON 混合解析器，收敛楼栋、容量、周次与特殊教室过滤
evaluation-parser.ts: 评教 HTML 解析器，收敛安全 URL、任务状态、满分表单与提交页判定
grade-parser.ts: 成绩 HTML 解析器，识别 session expired、评教阻断、合法空表与稳定成绩 DTO
schedule-parser.ts: 课表 HTML 解析器，识别非教学周、登录页并消除嵌套课程节点重复

架构决策
JW parser 对错误页和 session expired 作协议判定，但不负责凭证恢复、HTTP、缓存或业务编排；所有旧 academic parser 文件仅为再导出 Facade。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
