# infrastructure/
> L2 | 父级: /src/modules/notifications/AGENTS.md

成员清单
sqlite-activity-outbox.ts: 可嵌入 UGC Drizzle 事务的 Outbox writer，以及按事件短事务幂等插入 notification、失败状态回写的投影 store
sqlite-notification-repository.ts: recipient 隔离的 createdAt/id 排序分页、单调 ID 增量、未读计数与逐条幂等已读 adapter

架构决策
Outbox 写入必须同步使用调用方传入的现有事务，禁止返回 Promise 或自行开启旁路事务；投影时重新确认 Outbox 行仍存在，避免 unlike 与并发投影复活已撤销通知。
两个 adapter 只访问 activity_outbox/notifications 自有事实，不 JOIN users/community_profiles；actor 展示资料留给 application 经 Community 批量端口投影。
通知列表由 `(recipient_user_id, created_at DESC, id DESC)` 直接索引承载；增量按主键 ID 升序读取，已读事实永久保留。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
