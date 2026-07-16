# academic/
> L2 | 父级: /Users/xiangyun/workspace/huas-wechat-app/huas-server/src/services/AGENTS.md

成员清单
classroom-free-service.ts: 空教室服务，校验查询参数并通过 CLASSROOM_ADMIN_STUDENT_ID 配置的教务服务账号读取空教室数据
evaluation-service.ts: 评教用例服务，复用 EvaluationParser，以 actionable/blocked、有界续批及稳定业务字段增量完成批末确认
grade-service.ts: 成绩服务，校验 JW HTTP 与页面结构后解析缓存，错误页不得成为空成绩事实
schedule-facade.ts: 课表门面服务，统一 /api/schedule 与 /api/v1/schedule 的日期规范、JW/Portal fallback 与响应元信息
schedule-service.ts: JW 单源课表服务，读取教务课表、处理日期/周缓存、旧缓存提升与 refresh 旧值回退

架构决策
academic 服务是学校教务业务边界；路由不直接碰上游，解析器不直接碰缓存，凭证恢复交给 CredentialManager。
跨 JW/Portal 的课表 fallback 只进 schedule-facade；单源服务只处理自己的上游、缓存和错误，不知道 HTTP 路由方向。
空教室是服务账号代查能力，服务账号不可用返回 SERVICE_ACCOUNT_UNAVAILABLE，不伪装成用户凭证过期。

开发规范
任何回源、缓存 key、refresh 限流或 fallback 行为变更必须跑 business-flows 对应用例。

变更日志
2026-07-16: 评教 HTML/URL 规则下沉 EvaluationParser，服务只保留请求、批次与提交事实确认。
2026-07-16: 评教加入 blocked/actionable、有界续批与抗列表重排的批末回查；成绩拒绝 HTTP/结构错误页缓存。
2026-07-16: 评教提交改为响应校验加列表回查双重确认，DTO 分离本次 submittedCount 与累计 status.completedCount。
2026-06-30: 新增 schedule-facade.ts，收敛 /api/schedule 与 /api/v1/schedule 的双源 fallback 编排。
2026-06-30: 空教室管理员学号从硬编码迁移到 CLASSROOM_ADMIN_STUDENT_ID，并新增服务账号不可用语义。
2026-06-30: 播种 academic 服务 L2 地图。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
