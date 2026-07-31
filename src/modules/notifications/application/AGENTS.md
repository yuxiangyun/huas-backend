# application/
> L2 | 父级: /src/modules/notifications/AGENTS.md

成员清单
notification-application-service.ts: recipient 通知分页、Community actor 批量投影、未读计数与逐条已读用例编排
activity-outbox-projector.ts: 有界批次 Outbox 消费、逐事件失败隔离及指数退避状态写回
read-notification-cleanup-service.ts: 按保留期仅删除已读通知的周期维护用例

架构决策
列表先查询 Notifications 自身事实，再以一次 CommunityProfileReader.getMany 投影 actor；缺失资料视为跨边界契约破坏而非静默伪造作者。
Projector 不拥有定时器，请求后即时投影和后台重试都调用同一 runOnce；单事件失败不得阻断同批其他事件，重试时间持久化到 Outbox。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
