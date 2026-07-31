# application/
> L2 | 父级: /src/modules/treehole/AGENTS.md

成员清单
treehole-application-service.ts: 构造注入 persistence port 与活动投影触发器，编排内容校验、分页、公共用户帖子、互动提交后即时投影与管理删除

架构决策
application 只消费 domain、persistence port 与 Notifications 窄触发端口；输入标准化和用户 ID 校验发生在持久化之前，计数/Outbox 事务整体留在 SQLite adapter。

开发规范
不得直接 import infrastructure；新增外部副作用先证明是真实边界，再扩展最小 port。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
