# messaging/
> L2 | 父级: /src/modules/AGENTS.md

成员清单
application/: 私信用例编排，负责目标定位、会话变化高水位、严格幂等发送、三态消息、Community 投影与管理只读端口
domain/: 一对一会话、消息/图片事实、含 clientMessageId DTO、会话/消息游标、输入校验与依赖倒置 ports
http/: 受 Bearer 认证的私信路由工厂，承载会话翻页/增量、目标入口、三态消息、上传门禁、已读和鉴权媒体响应
infrastructure/: Messaging SQLite 会话 lastMessageId 增量/消息游标/事实限流 adapter 与带审计上下文的私有媒体生命周期 adapter
composition.ts: Messaging 局部组合根，构造 service/routes/operationsQuery/orphanMediaCleanup 且不反向依赖根装配

架构决策
Messaging 只拥有 conversations/messages/message_images 与 message-media；不写入活动通知，不 JOIN users/community_profiles，查询自有事实后经 CommunityProfileReader 批量投影参与者。
会话定位只返回目标 CommunityProfile 与已有 conversationId，不创建空会话；首条消息仍在同步 SQLite 短事务中按有序 user pair 幂等建会话。压缩前先按 messages 事实预检 30 条/分钟，事务内再次复验；UUID 重试必须与原接收人、规范化文字和规范化图片内容完全一致。
消息历史无游标读取最新页，before 向旧、after 向新增，三种场景最终都按消息 ID 升序返回；用户与 Operations 管理只读入口共享 hasMore 方向语义。
会话 offset 只用于普通翻页；轮询统一使用 `/conversations/changes` 的全局 lastMessageId 高水位，返回会话 ID 供稳定覆盖去重，管理员入口复用同一语义。
普通媒体只能由认证后的会话参与者读取；Operations 只能经 MessagingOperationsQueryPort 读取会话、消息和媒体，本模块不导出任何管理修改命令。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
