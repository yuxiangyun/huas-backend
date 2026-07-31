# domain/
> L2 | 父级: /src/modules/messaging/AGENTS.md

成员清单
messaging.ts: Messaging 策略、含 clientMessageId 响应 DTO、会话 lastMessageId/消息三态游标、Unicode/图片/UUID 纯规则
ports.ts: 会话定位/增量、压缩前事实限流、三态消息仓储、媒体 conversationId 与管理只读查询依赖倒置契约

架构决策
领域层只表达一对一会话与图文消息语义；公开人物固定使用 CommunityProfile，图片只暴露经鉴权的媒体 URL，不泄露存储路径。
Idempotency-Key 必须是 UUID 且重试不可改变接收人或规范化图文内容，MessageResponse 必须回传该键供前端合并；文字长度以 Unicode code point 计数，空白文字归一为 null，但只有图片时仍是有效消息。
beforeMessageId 与 afterMessageId 互斥；无游标/向旧页的 hasMore 表示仍有更旧事实，增量页的 hasMore 表示本次上限后仍有更新事实。
会话变化以全局单调 messages.id 为高水位，重复轮询允许同一 conversationId 覆盖旧状态，禁止用 offset 承担实时增量。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
