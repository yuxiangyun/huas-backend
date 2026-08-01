# user/
> L2 | 父级: /Users/xiangyun/workspace/huas-wechat-app/huas-server/web/AGENTS.md

成员清单

api/user-api.ts: 校园资料与日历订阅 HTTP 边界，保持校园身份和 Community 公共社交资料协议隔离
api/user-queries.ts: 校园资料 Query 编排，普通读取复用标准策略，`refresh=true` 使用零新鲜/零保留旁路并只把成功结果写回普通资料键
model/user-types.ts: 校园姓名、学号、班级、身份和日历订阅链接的稳定前端契约

架构决策

强制刷新必须真实到达服务端，不得被客户端 Query 新鲜期截断；同一时刻的请求仍由 TanStack Query 合并，旁路结果完成后立即回收独立键。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
