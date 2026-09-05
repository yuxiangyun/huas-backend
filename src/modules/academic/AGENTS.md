# academic/
> L2 | 父级: /Users/xiangyun/workspace/huas-wechat-app/huas-server/src/modules/AGENTS.md

成员清单
application/: Academic 用例编排，维持课表、成绩、评教与空教室的公开服务契约
domain/: Academic 纯业务契约与规则，不接触 HTTP、数据库、缓存或进程运行时
infrastructure/: Academic 对共享缓存、校园系统与持久化能力的适配入口
schedule.ts: Schedule composition root，装配单源 reader、文件热策略与统一 Facade，并暴露兼容静态类和 Operations 策略门面
grade.ts: Grades composition root，装配默认端口并暴露兼容静态类
evaluation.ts: Evaluation composition root，装配默认端口并暴露兼容静态类与 DTO
classroom.ts: Classrooms composition root，装配服务账号端口并暴露兼容静态类

架构决策
Academic 是学业领域的 canonical 纵向切片；application 只经 domain ports 访问外部 I/O，composition root 装配 infrastructure 实现，Campus Integrations 负责学校协议翻译。
旧 services/academic 与 PortalScheduleService 仅单向再导出本模块，Calendar 经公开 getMobileJwSchedule 固定读取移动教务单源及同源 stale，不读取全局来源策略。
mobile-jw 作为独立 reader 装配；新 mobile-jw-first 模式依次移动教务/JW/Portal，旧两种模式保留双源合同。历史端点实测空表与当前有课矛盾，因此第三源只消费当前学期 curriculum 并严格按真实日期缓存；范围不支持不代表未公布，不参与最终错误优先级仲裁。
统一 `/api/schedule` 只读取一次策略快照；Operations 经本 composition 的公开策略门面执行热切换，不直接依赖 Academic infrastructure。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
