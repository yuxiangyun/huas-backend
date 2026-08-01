# http/
> L2 | 父级: /src/modules/messaging/AGENTS.md

成员清单
messaging.routes.ts: createMessagingRoutes 注入式 Hono factory，提供会话普通/lastMessageId 增量、目标定位、三态消息、按字段线序合并图片别名的上传门禁与参与者媒体

架构决策
路由由上层统一 Bearer 认证；目标定位校验存在且禁止自己，只查询有序用户对而不建空会话；before/after 互斥，成功增量轮询可由全局日志中间件静默。发送在 formData 前以共享 requestBodyLimit 覆盖 Content-Length 与流式请求体并稳定返回 413，解析后复用单图/总量/数量策略，日志永不写入正文、文件名或二进制内容。
`/conversations/changes` 接收非负 afterMessageId 并按消息高水位返回变化会话；普通 `/conversations` 的 page/pageSize 不用于轮询。
私信媒体不挂公开 `/media/*`；文件响应前必须由 Messaging 自有事实证明当前用户是会话参与者，且敏感响应使用 `private, no-store`。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
