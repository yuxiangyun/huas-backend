# domain/
> L2 | 父级: /src/modules/notifications/AGENTS.md

成员清单
activity.ts: 六类 ActivityEvent、类型与资源匹配规则、逐 recipient 稳定 eventId 以及 recipient 去重/自我互动过滤纯函数
notification.ts: 通知事实/响应/分页 DTO、默认策略、北京时间映射与分页收敛规则
ports.ts: 泛型同步事务内 ActivityOutboxWriter、提交后 ActivityProjectionTrigger、可重试投影 store 与 NotificationRepository 依赖倒置边界

架构决策
事件只保存 actor、recipient、类型和内容稳定引用，不携带帖子、评论或消息正文；eventId 包含互动事实与 recipient，保证同一互动面向不同接收者独立幂等。
Discover/Treehole 只依赖 ActivityEvent 与泛型同步 Outbox writer，不得反向依赖 Notifications 的 SQLite adapter 或组合实例；Bun SQLite 事务回调禁止返回 Promise。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
