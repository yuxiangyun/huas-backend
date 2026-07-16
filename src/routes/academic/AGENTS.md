# academic/
> L2 | 父级: /Users/xiangyun/workspace/huas-wechat-app/huas-server/src/routes/AGENTS.md

成员清单
classroom.routes.ts: 空教室 HTTP 适配器，解析楼栋/日期/节次查询并调用 ClassroomFreeService
evaluation.routes.ts: 评教 HTTP 适配器，区分 actionable/blocked 任务并返回有界批次、经上游回查确认的提交结果 DTO
grade.routes.ts: 成绩 HTTP 适配器，解析查询参数并调用 GradeService
schedule.routes.ts: JW 优先课表 HTTP 适配器，读取 date/refresh 参数并委托 ScheduleFacade 处理缓存与 Portal 兜底

架构决策
教务路由表达学校上游入口；具体解析、缓存、刷新、fallback 和凭证恢复由 services 与 middleware 承担。

开发规范
课表 fallback 改动必须同时跑 business-flows 与 schedule/parser 测试；评教提交改动必须跑 evaluation-parser 测试。

变更日志
2026-07-16: 评教区分 actionable/blocked 状态，提交采用有界批次并以批末回查确认本次成功数。
2026-06-30: schedule.routes.ts 下沉双源 fallback 到 ScheduleFacade，路由只保留 HTTP 适配职责。
2026-06-30: 播种 academic 路由 L2 地图。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
