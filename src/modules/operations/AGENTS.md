# operations/
> L2 | 父级: /src/modules/AGENTS.md

成员清单
application/: 管理仪表盘、社区管理与 Messaging 管理只读用例编排，仅消费公开 query/command ports 与 Operations 自有能力端口
domain/: Operations 稳定 DTO 与端口，不承载 analytics 持久化规则
http/: 后台会话、管理面、Early Rising 展示设置、公共公告/首页弹窗、live/ready 与 Prometheus 指标 Hono 协议适配器
infrastructure/: analytics SQLite 事实、公告/首页弹窗/日志文件、公开弹窗媒体与健康探针 adapters
composition.ts: Operations 局部组合工厂，接收 Identity/Discover/Treehole/Messaging 公开查询与命令 ports，并构造管理 application/HTTP

架构决策
Operations 是管理与运行支撑纵向切片；Dashboard 与 Messaging 管理入口不理解跨领域表，只通过 Identity/Discover/Treehole/Messaging 公开 query ports 聚合稳定 DTO，且私信不暴露修改命令。
跨领域 concrete 只在 src/composition.ts 连接；Operations composition 不 import 社交 SQLite adapter 或业务 singleton。
analytics 在请求内仅聚合事实，并以短周期单事务批量写入；公告、首页弹窗、日志、后台会话与 SQLite SELECT 1 属于本模块基础设施。
旧 routes/services/runtime/middleware 只允许单向再导出本模块 canonical 实现，本模块不得反向依赖这些 Facade。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
