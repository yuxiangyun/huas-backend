# discover/
> L2 | 父级: /Users/xiangyun/workspace/huas-wechat-app/huas-server/src/modules/AGENTS.md

成员清单
application/: Discover 用例编排层，仅依赖 domain ports 与规则
domain/: Discover 稳定 DTO、校验/分页规则、persistence/media ports 与 Operations 管理只读查询契约
http/: Discover Hono 协议适配器，保持 /api/discover 请求响应契约
infrastructure/: SQLite 查询/事务、Operations 管理快照与本地图片处理、可见性 adapters
composition.ts: 模块组合根，注入 SQLite 与媒体 adapter，并暴露兼容静态类

架构决策
依赖方向固定为 http → composition → application → domain ports；composition 单点连接 infrastructure，application 不感知 Drizzle、Bun 或文件系统。
评分聚合、评论计数等事务整体保留在 SQLite adapter；发帖失败媒体补偿与软删除后媒体清理由 application 编排。
Operations 只消费 DiscoverOperationsQueryPort，帖子/评分表、作者 join 与图片 JSON 映射不越出本模块。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
