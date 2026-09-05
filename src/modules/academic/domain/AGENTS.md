# domain/
> L2 | 父级: /Users/xiangyun/workspace/huas-wechat-app/huas-server/src/modules/academic/AGENTS.md

成员清单
schedule.ts: 三源课表结果、来源能力不支持错误、缓存状态与请求追踪的稳定领域契约
schedule-source-policy.ts: 课表来源模式、状态快照、持久化端口与移动教务/JW/Portal 有序 plan 纯规则
ports.ts: 移动教务只读课表窄端口，以及 Academic 带可选总预算/错误分类的校园上游、缓存读写/快照条件失效/保时无覆盖提升与 refresh fallback 真实 I/O 端口
grade.ts: 成绩查询规范化与 hash、评教发现依赖端口
evaluation.ts: 评教任务、状态与批次提交 DTO；unknown/未确认计数独立于回查成功与否，回查失败标志说明 status 来自旧快照，并定义应用依赖端口
classroom.ts: 空教室查询规范化、审计 actor 与服务账号查询端口

架构决策
domain 只表达 Academic 业务语言与纯规则；禁止依赖 Hono、Drizzle、Bun、文件系统及具体校园客户端。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
