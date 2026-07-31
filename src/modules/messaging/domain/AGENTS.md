# domain/
> L2 | 父级: /src/modules/messaging/AGENTS.md

成员清单
messaging.ts: Messaging 策略、事实/响应 DTO、Unicode/图片/UUID 校验与时间映射纯规则
ports.ts: 消息仓储、候选媒体与管理只读查询的依赖倒置契约

架构决策
领域层只表达一对一会话与图文消息语义；公开人物固定使用 CommunityProfile，图片只暴露经鉴权的媒体 URL，不泄露存储路径。
Idempotency-Key 必须是 UUID，文字长度以 Unicode code point 计数；空白文字归一为 null，但只有图片时仍是有效消息。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
