# admin/
> L2 | 父级: /Users/xiangyun/workspace/huas-wechat-app/huas-server/web/AGENTS.md

成员清单
api/admin-api.ts: 后台 HTTP 适配边界，统一管理会话、业务资源、私信只读与运行查询的路径和传输契约
api/admin-queries.ts: TanStack Query 服务器状态编排层，向后台页面提供稳定查询、私信三态游标与 mutation hooks
model/admin-query-keys.ts: 后台资源缓存命名边界，隔离内容、私信会话/消息和运行状态身份
model/admin-types.ts: 后端管理接口的协议模型，包含 Community 参与者和 Messaging 只读 DTO

架构决策
后台实体只适配当前生产管理能力；Messaging 仅暴露会话、增量、历史和私有媒体读取，不创建任何写入命令或兼容入口。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
