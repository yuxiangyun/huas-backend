# social/
> L2 | 父级: /Users/xiangyun/workspace/huas-wechat-app/huas-server/web/AGENTS.md

成员清单

api/social-summary-api.ts: `/api/social/unread-summary` 跨 Social 只读摘要传输边界，一次返回私信与互动未读及通知总量
api/social-summary-query.ts: Social 摘要唯一轮询 hook，由应用壳按当前 Tab 选择频率
model/social-summary-query-keys.ts: Social 聚合读模型缓存键命名源，供消息和通知写后统一失效
model/social-summary-types.ts: 私信未读、互动未读与通知总量的稳定前端契约

架构决策

Social 摘要只聚合读模型，不合并 Messaging 与 Notifications 的业务事实；应用壳是唯一轮询拥有者，页面通过 Outlet 上下文消费同一快照。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
