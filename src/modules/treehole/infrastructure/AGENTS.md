# infrastructure/
> L2 | 父级: /src/modules/treehole/AGENTS.md

成员清单
sqlite-treehole-admin-persistence.ts: 管理侧 Treehole 事实查询与软删除事务，经 Community reader 批量投影公共作者、经媒体 reader 投影管理图片 URL，并返回待补偿媒体键
sqlite-treehole-persistence.ts: 聚合用户/管理 SQLite 能力并注入媒体 reader，完整实现含图片元数据的 TreeholePersistence port
sqlite-treehole-operations-query.ts: 构造注入 db/profile/media reader/policy 的 TreeholeOperationsQueryPort 只读 adapter，后台帖子统一投影管理图片 URL
sqlite-treehole-support.ts: 无全局状态的数据库/事务类型、含图片元数据事实选择器、点赞批量查询、作者/用户图片批量映射与计数刷新 helper
sqlite-treehole-user-persistence.ts: 用户侧含图片帖子/用户帖子、幂等点赞与差异回复通知、计数/Outbox 原子写入及返回待补偿媒体键的作者删除事务 adapter
treehole-post-media-storage.ts: 顺序压缩至限额 WebP 的私有媒体 adapter，严格 UUID/01.webp..09.webp 路径、活跃帖子引用读取、整批失败补偿与宽限期孤儿回收

架构决策
Drizzle db 与 CommunityProfileReader 必须构造注入；查询只访问 Treehole 自有事实表，不得调用 getDb 或 JOIN users/community_profiles。
列表先完成事实分页，再对本页全部 userId 执行一次 getMany；点赞和评论计数与活动 Outbox 经注入 writer 在同一短事务提交，Bun SQLite 事务 callback 必须同步，投影仅在提交后触发。
Treehole 图片文件与帖子 SQLite 事实采用显式补偿而非伪跨资源事务；只有活跃帖子 images_json 明确列出的严格文件名可被用户或管理员读取。

开发规范
不得引用旧 routes/services Facade 或 modules/discover；新增 SQL helper 仅服务 Treehole 事实表。
媒体压缩必须逐张串行，单批任一失败删除整个 UUID 目录；孤儿回收只扫描 storage root 的严格 UUID 直接子目录，活跃引用永不删除，单目录失败隔离后聚合上报。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
