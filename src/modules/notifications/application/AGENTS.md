# application/
> L2 | 父级: /src/modules/notifications/AGENTS.md

成员清单
notification-application-service.ts: recipient 通知普通分页/ID 增量、Community actor 批量投影、未读/总量摘要与逐条已读编排
activity-outbox-projector.ts: 有界批次 Outbox 消费、投影/失败写回双层逐事件隔离及指数退避状态写回

架构决策
列表先查询 Notifications 自身事实，再以一次 CommunityProfileReader.getMany 投影 actor；缺失资料视为跨边界契约破坏而非静默伪造作者。
Projector 不拥有定时器，请求后即时投影和后台重试都调用同一 runOnce；单事件投影及其失败状态写回再次异常都不得阻断同批其他事件，成功写回时重试时间持久化到 Outbox。
应用层不提供通知清理用例；readAt 只表达当前 recipient 的逐条阅读状态，摘要 total 只暴露快照版本差异而不泄露其他 recipient 事实。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
