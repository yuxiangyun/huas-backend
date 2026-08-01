# infrastructure/
> L2 | 父级: /src/modules/messaging/AGENTS.md

成员清单
sqlite-messaging-repository.ts: 构造注入 Drizzle db 的 Messaging 事实 adapter，承载有序用户对、单调会话时间/lastMessageId、三态消息、双重限流与未读
messaging-media-storage.ts: message-media 候选目录、规范化 WebP 幂等比对、补偿/安全路径、参与者读取及带 conversationId 的管理读取 adapter

架构决策
SQLite adapter 只访问 conversations/messages/message_images，不 JOIN users/community_profiles；Bun SQLite 的 transaction callback 必须保持同步，所有事务内 Drizzle 语句显式使用 `.all()`/`.run()`。
媒体 adapter 先检查原图单张与总量边界，再在 SQLite 事务外完成旋转、缩放和 WebP 编码；相同 UUID 的图片重试比较规范化元数据与字节，目录名与文件名使用严格白名单并拒绝路径穿越。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
