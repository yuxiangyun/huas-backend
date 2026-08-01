# messaging/
> L2 | 父级: /Users/xiangyun/workspace/huas-wechat-app/huas-server/web/AGENTS.md

成员清单
api/messaging-api.ts: `/api/messaging` 会话、消息、阅读游标与幂等图文发送传输边界
api/messaging-cache-policy.ts: 无框架消息历史合并策略，把发送/after 增量写入最新页并保留 before 历史和游标
api/messaging-queries.ts: TanStack Query 查询与 mutation 编排，首屏读取 20 条并以 before/after 游标延续，高水位轮询键按周期短保留，发送/增量合并历史缓存、首发回填会话且写后失效聚合摘要
model/messaging-query-keys.ts: Messaging 查询键命名源，隔离会话、目标、历史与未读读模型
model/messaging-types.ts: Community 参与者、一对一会话、图文消息及游标响应的前端契约

架构决策
空会话不在客户端伪造：路由只保存 userId，目标定位结果是 conversationId 唯一事实；首条消息成功后将服务端 conversationId 回填同一目标缓存。
会话列表普通分页只服务人工加载，增量刷新使用 lastMessageId 高水位；消息历史保持 latest/before/after 语义，不用 offset 模拟实时消息。
图文发送使用浏览器 UUID 作为 Idempotency-Key，失败后的相同草稿复用原 UUID；发送成功直接并入消息高水位而不重取首屏，私有媒体由共享原语按 URL/认证模式进入有界会话 LRU。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
