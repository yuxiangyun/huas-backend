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
旧 services/academic 与 PortalScheduleService 仅单向再导出本模块，Calendar 完成迁移前继续通过旧 ScheduleFacade 路径消费相同运行时类。
统一 `/api/schedule` 只读取一次策略快照；Operations 经本 composition 的公开策略门面执行热切换，不直接依赖 Academic infrastructure。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
