# parsers/
> L2 | 父级: /Users/xiangyun/workspace/huas-wechat-app/huas-server/src/modules/campus-integrations/jw/AGENTS.md

成员清单
classroom-free-parser.ts: 空教室 HTML/JSON 混合解析器，所有入口拒绝登录页和通用错误页，楼栋/空教室仅以 JSON 容器、option 或 dataList 目标结构证明合法空态
evaluation-parser.ts: 评教 HTML 解析器，通过共享 JW 登录页判定保护入口发现、列表、表单和提交页，再收敛安全 URL、任务状态与满分表单
grade-parser.ts: 成绩 HTML 解析器，通过共享 JW 登录页判定触发会话恢复，并识别评教阻断、合法空表与稳定成绩 DTO
session-page.ts: JW HTTP 200 登录页与已登录主框架共享结构判定，避免业务解析器漏判失效或换票器误报激活
schedule-parser.ts: 课表 HTML 解析器，复用共享 JW 登录页判定、识别非教学周并消除嵌套课程节点重复

架构决策
JW parser 对错误页和 session expired 作协议判定，但不负责凭证恢复、HTTP、缓存或业务编排；所有旧 academic parser 文件仅为再导出 Facade。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
