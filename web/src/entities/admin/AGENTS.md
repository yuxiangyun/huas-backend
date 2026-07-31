# admin/
> L2 | 父级: /Users/xiangyun/.codex/worktrees/4443/huas-server/web/AGENTS.md

成员清单
api/admin-api.ts: 后台 HTTP 适配边界，统一管理会话、业务资源与运行查询的路径和传输契约
api/admin-queries.ts: TanStack Query 服务器状态编排层，向后台页面提供稳定查询与 mutation hooks
model/admin-query-keys.ts: 后台资源缓存命名边界，保证查询、变更和会话清理共享资源身份
model/admin-types.ts: 后端管理接口的协议模型，防止页面层重新解释运行与业务数据

架构决策
后台实体只适配当前生产管理能力；已删除的运行开关不保留类型、query key 或 HTTP 兼容入口。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
