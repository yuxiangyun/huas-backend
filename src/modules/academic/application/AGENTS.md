# application/
> L2 | 父级: /Users/xiangyun/workspace/huas-wechat-app/huas-server/src/modules/academic/AGENTS.md

成员清单
schedule-service.ts: JW 单源周课表用例，分离 current/stale reader，并保留周缓存、同意图回源合并与旧日粒度提升
portal-schedule-service.ts: Portal 单源日期课表用例，分离 current/stale reader，并保留范围校验、同意图回源合并、旧缺载荷缓存条件淘汰与缓存限额
schedule-facade.ts: JW/Portal 通用 plan 编排，按策略穷尽 current 后固定 JW→Portal 读取 stale，固化请求级快照元信息并保留 legacy 主源未公布短路与错误优先级
schedule-source-policy-service.ts: 课表来源策略用例边界，统一读取状态快照与持久化热切换命令
grade-service.ts: fresh-first 成绩读取用例，以 45 秒总预算有限重试凭证恢复、502/503/504 与一次无效页，并在新鲜路径穷尽后执行 stale fallback
evaluation-service.ts: 评教用例，保留 actionable/blocked、有界批次、提交验证与批末回查
classroom-free-service.ts: 空教室用例，分离审计 actor 与配置化服务账号上游身份

架构决策
application 只编排用例顺序并消费 canonical 纯解析器，不定义校园协议或数据库查询；服务采用构造注入，composition root 负责暴露旧静态类签名。
课表双源 stale 必须由 Facade 在两个 current 都失败后统一选择，单源 service 在编排路径中不得提前降级；旧缓存顺序固定 JW→Portal，不受热模式影响。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
