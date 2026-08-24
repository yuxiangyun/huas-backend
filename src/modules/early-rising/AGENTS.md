# early-rising/
> L2 | 父级: /src/modules/AGENTS.md

成员清单
application/: 打卡、统计、趋势、排行榜与展示设置的应用编排及外部端口
domain/: 北京时间窗口、周期范围、排名与展示设置快照等稳定领域契约
http/: Bearer 认证后的 Early Rising Hono 协议适配器
infrastructure/: SQLite 打卡事实与单行展示设置 adapters
composition.ts: Early Rising 局部组合根，连接事实仓储、设置仓储、Community 详细资料 reader 与 HTTP

架构决策
打卡日期、资格、连续值和排名均由服务端北京时间与 SQLite 事实裁决；客户端不提交时间事实。排行榜资料只通过 CommunityDetailedProfileReader 批量投影，Early Rising 不读取 Community 表。
排行榜个人资料入口设置由本模块单行 SQLite 快照拥有；用户接口只读布尔展示事实，后台管理经 Operations 注入端口读写，跨模块 concrete 仅在根组合连接。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
