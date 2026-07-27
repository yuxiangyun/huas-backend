# academic/
> L2 | 父级: /Users/xiangyun/workspace/huas-wechat-app/huas-server/src/services/AGENTS.md

成员清单
classroom-free-service.ts: ClassroomFreeService 兼容再导出，canonical 空教室用例位于 modules/academic
evaluation-service.ts: EvaluationService/Parser/DTO 兼容再导出，canonical 评教用例位于 modules/academic
grade-service.ts: GradeService 兼容再导出，canonical 成绩用例位于 modules/academic
schedule-facade.ts: ScheduleFacade/DTO 兼容再导出，Calendar 迁移前保持旧消费路径稳定
schedule-service.ts: ScheduleService 兼容再导出，canonical JW 单源课表位于 modules/academic

架构决策
本目录仅保留迁移兼容面，运行时类引用与 modules/academic composition 完全一致；禁止重新添加业务实现或反向依赖。
Calendar、routes 在后续独立迁移前继续使用旧路径，但实际执行已进入 Academic application。

开发规范
任何回源、缓存 key、refresh 限流或 fallback 行为变更必须跑 business-flows 对应用例。

变更日志
2026-07-27: 课表、成绩、评教与空教室迁入 modules/academic，本目录全部退化为再导出 Facade。
2026-07-16: 评教 HTML/URL 规则下沉 EvaluationParser，服务只保留请求、批次与提交事实确认。
2026-07-16: 评教加入 blocked/actionable、有界续批与抗列表重排的批末回查；成绩拒绝 HTTP/结构错误页缓存。
2026-07-16: 评教提交改为响应校验加列表回查双重确认，DTO 分离本次 submittedCount 与累计 status.completedCount。
2026-06-30: 新增 schedule-facade.ts，收敛 /api/schedule 与 /api/v1/schedule 的双源 fallback 编排。
2026-06-30: 空教室管理员学号从硬编码迁移到 CLASSROOM_ADMIN_STUDENT_ID，并新增服务账号不可用语义。
2026-06-30: 播种 academic 服务 L2 地图。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
