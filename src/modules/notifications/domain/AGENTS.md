# domain/
> L2 | 父级: /src/modules/notifications/AGENTS.md

成员清单
activity.ts: 六类 ActivityEvent、回复双方差异类型、逐 recipient 稳定 eventId 以及去重/自我互动过滤纯函数
notification.ts: 通知事实/响应、普通分页、ID 增量、未读/总量摘要 DTO、默认策略与北京时间映射
ports.ts: 泛型同步事务内 ActivityOutboxWriter、提交后 ActivityProjectionTrigger、可重试投影 store 与列表/摘要 NotificationRepository 边界

架构决策
事件只保存 actor、recipient、类型和内容稳定引用，不携带帖子、评论或消息正文；eventId 包含互动事实与 recipient，保证同一互动面向不同接收者独立幂等。
回复由共享纯函数固定为父评论作者收 reply、不同帖子作者收 comment，并统一排除 actor 与重复 recipient，Discover/Treehole 不得各自重写规则。
Discover/Treehole 只依赖 ActivityEvent 与泛型同步 Outbox writer，不得反向依赖 Notifications 的 SQLite adapter 或组合实例；Bun SQLite 事务回调禁止返回 Promise。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
