# application/
> L2 | 父级: /Users/xiangyun/workspace/huas-wechat-app/huas-server/src/modules/academic/AGENTS.md

成员清单
schedule-service.ts: JW 单源周课表用例，保留周缓存、同意图回源合并、旧日粒度提升、强制刷新与 stale fallback
portal-schedule-service.ts: Portal 单源日期课表用例，保留范围校验、同意图回源合并、缓存限额与空周语义
schedule-facade.ts: JW/Portal 双源课表编排，固定源优先级、周范围 fallback 与响应元信息
grade-service.ts: 成绩读取用例，保留查询规范化、哈希缓存、同意图回源合并、评教门禁与 stale fallback
evaluation-service.ts: 评教用例，保留 actionable/blocked、有界批次、提交验证与批末回查
classroom-free-service.ts: 空教室用例，分离审计 actor 与配置化服务账号上游身份

架构决策
application 只编排用例顺序并消费 canonical 纯解析器，不定义校园协议或数据库查询；服务采用构造注入，composition root 负责暴露旧静态类签名。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
