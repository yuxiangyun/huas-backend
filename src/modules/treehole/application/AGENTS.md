# application/
> L2 | 父级: /src/modules/treehole/AGENTS.md

成员清单
treehole-application-service.ts: 构造注入 persistence/media ports 与活动投影触发器，编排图文校验、顺序压缩/写库补偿、私有读取、删除/孤儿回收、分页与互动投影

架构决策
application 只消费 domain、persistence/media ports 与 Notifications 窄触发端口；图片在 SQLite 事务外处理，文件/事实用显式补偿与孤儿回收达成最终一致，计数/Outbox 事务仍留在 SQLite adapter。

开发规范
不得直接 import infrastructure；新增外部副作用先证明是真实边界，再扩展最小 port。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
