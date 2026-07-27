# operations/
> L2 | 父级: /Users/xiangyun/workspace/huas-wechat-app/huas-server/src/modules/AGENTS.md

成员清单
application/: 管理仪表盘与社区管理用例编排，仅消费公开只读 query ports 与 Operations 自有能力端口
domain/: Operations 稳定 DTO 与端口，不承载 analytics 持久化规则
http/: 后台会话、管理面、公共公告、live/ready 与 Prometheus 指标 Hono 协议适配器
infrastructure/: analytics SQLite 事实、公告/日志文件、UGC 运行态、健康探针及跨域命令 adapters
composition.ts: Operations 唯一装配根，连接 Identity/Discover/Treehole 公开查询端口与本模块基础设施

架构决策
Operations 是管理与运行支撑纵向切片；Dashboard 不理解跨领域表，只通过 Identity/Discover/Treehole 公开只读 query ports 聚合稳定 DTO。
analytics 在请求内仅聚合事实，并以短周期单事务批量写入；公告、日志、后台会话、UGC 文件态与 SQLite SELECT 1 属于本模块基础设施。
旧 routes/services/runtime/middleware 只允许单向再导出本模块 canonical 实现，本模块不得反向依赖这些 Facade。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
