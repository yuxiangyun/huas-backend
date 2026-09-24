# domain/
> L2 | 父级: /Users/xiangyun/workspace/huas-wechat-app/huas-server/src/modules/academic/AGENTS.md

成员清单
schedule.ts: 三源课表结果、来源能力不支持错误、缓存状态与请求追踪的稳定领域契约
schedule-source-policy.ts: 后台来源模式/快照/持久化端口、两态用户首选校验与 current 首选前置去重规则，保留后台后备相对顺序
ports.ts: 移动教务只读课表窄端口，以及 具名 JW/Portal 课表读取、缓存读写/快照条件失效/保时无覆盖提升与 refresh fallback 真实 I/O 端口
grade.ts: 成绩查询规范化与 hash、具名成绩读取端口
training-plan.ts: JW 培养方案、执行计划、完成状态、体系学分与学期展示的稳定纯 DTO；全程课程标记独立于完成状态，保持原始行与投影语义分离
evaluation.ts: 评教任务、状态与批次提交 DTO；unknown/未确认计数独立于回查成功与否，回查失败标志说明 status 来自旧快照，并定义应用依赖端口
classroom.ts: 空教室查询规范化、审计 actor 与服务账号查询端口

架构决策
domain 只表达 Academic 业务语言与纯规则；禁止依赖 Hono、Drizzle、Bun、文件系统及具体校园客户端。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
