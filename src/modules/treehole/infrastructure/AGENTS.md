# infrastructure/
> L2 | 父级: /src/modules/treehole/AGENTS.md

成员清单
sqlite-treehole-admin-persistence.ts: 管理侧 Treehole 事实查询与软删除事务，经 Community reader 批量投影公共作者
sqlite-treehole-persistence.ts: 聚合用户/管理 SQLite 能力并完整实现 TreeholePersistence port
sqlite-treehole-operations-query.ts: 构造注入 db/profile reader/policy 的 TreeholeOperationsQueryPort 只读 adapter
sqlite-treehole-support.ts: 无全局状态的数据库/事务类型、事实选择器、点赞批量查询、作者批量映射与计数刷新 helper
sqlite-treehole-user-persistence.ts: 用户侧帖子/用户帖子、幂等点赞与差异回复通知、计数/Outbox 原子写入及作者删除事务 adapter

架构决策
Drizzle db 与 CommunityProfileReader 必须构造注入；查询只访问 Treehole 自有事实表，不得调用 getDb 或 JOIN users/community_profiles。
列表先完成事实分页，再对本页全部 userId 执行一次 getMany；点赞和评论计数与活动 Outbox 经注入 writer 在同一短事务提交，Bun SQLite 事务 callback 必须同步，投影仅在提交后触发。

开发规范
不得引用旧 routes/services Facade 或 modules/discover；新增 SQL helper 仅服务 Treehole 事实表。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
