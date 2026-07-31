# infrastructure/
> L2 | 父级: /src/modules/messaging/AGENTS.md

成员清单
sqlite-messaging-repository.ts: 构造注入 Drizzle db 的 Messaging 事实 adapter，承载会话唯一性、同步短事务消息提交、鉴权查询、游标与未读计算
messaging-media-storage.ts: 共享图片转换器驱动的 message-media 候选目录、补偿删除、安全路径、参与者/管理读取与无主清理 adapter

架构决策
SQLite adapter 只访问 conversations/messages/message_images，不 JOIN users/community_profiles；Bun SQLite 的 transaction callback 必须保持同步，所有事务内 Drizzle 语句显式使用 `.all()`/`.run()`。
媒体 adapter 先检查原图单张与总量边界，再在 SQLite 事务外完成旋转、缩放和 WebP 编码；目录名与文件名使用严格白名单，拒绝路径穿越。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
