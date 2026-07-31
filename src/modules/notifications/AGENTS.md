# notifications/
> L2 | 父级: /src/modules/AGENTS.md

成员清单
application/: 通知列表/未读/逐条已读用例、Outbox 可重试投影与已读历史清理
domain/: 六类活动事件、稳定 eventId、公共响应/策略与依赖倒置 ports
http/: 注入式活动通知列表、未读计数与单条已读 Hono 路由
infrastructure/: 构造注入的 SQLite Outbox writer/projector store 与通知仓储
composition.ts: 局部模块组合根，接收 db/CommunityProfileReader 并返回 HTTP、事务 writer、projector 与 cleanup 实例

架构决策
Notifications 只保存 Discover/Treehole 六类活动的稳定引用；不复制互动正文、不承载 Messaging 未读，也不建立到 UGC 内容表的跨领域外键。
互动事实与 activity_outbox 由 UGC adapter 在同一 SQLite 事务提交；eventId 按 recipient 幂等，unlike 在同事务删除未投影事件和已投影通知，请求后即时投影与周期重试复用同一 projector。
列表 actor 先查询通知事实，再经 CommunityProfileReader.getMany 批量投影；禁止 JOIN users/community_profiles，Community 不反向依赖本模块。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
