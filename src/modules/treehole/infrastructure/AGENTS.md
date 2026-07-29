# infrastructure/
> L2 | 父级: /Users/xiangyun/workspace/huas-wechat-app/huas-server/src/modules/treehole/AGENTS.md

成员清单
sqlite-treehole-admin-persistence.ts: 管理侧 SQLite 查询与软删除事务，唯一暴露真实作者信息
sqlite-treehole-persistence.ts: 聚合社区资料、用户/管理 SQLite 能力并完整实现 TreeholePersistence port
sqlite-treehole-operations-query.ts: TreeholeOperationsQueryPort 的只读 adapter，复用管理 SQL 并保持原分页策略
sqlite-treehole-support.ts: Treehole 专属 Drizzle 选择器、社区资料/点赞批量查询、响应列表与计数刷新 helper
sqlite-treehole-user-persistence.ts: 社区资料与用户侧 SQLite 查询，保持点赞、评论/通知/计数及删除事务
treehole-avatar-media-storage.ts: sharp 压缩、本地 WebP 存储/删除、公开读取和 immutable 缓存语义

架构决策
原 Drizzle 事务整体留在用户/管理 SQLite adapter，SQL 顺序不因应用分层而拆散。
头像媒体通过注入的 persistence 校验数据库已发布 URL 后才公开文件，昵称与头像只从 users 实时投影，防止资料快照和内容脱节。

开发规范
不得引用旧 routes/services Facade 或 modules/discover；新增 SQL helper 仅服务 Treehole 事实表。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
