# community/
> L2 | 父级: /src/modules/AGENTS.md

成员清单
application/: 公共/本人资料用例编排，批量合成 Identity 班级事实与 Community 昵称/头像事实
domain/: 三字段公共作者、含 nickname 本人 DTO、缺省 displayName/昵称校验规则与资料/媒体端口
http/: 含 nickname 当前用户资料写入与三字段公共用户详情的注入式 Hono 路由工厂
infrastructure/: community_profiles SQLite adapter 与本地头像媒体 adapter

架构决策
Community 是公开身份投影的唯一所有者；只经 Identity 的 CommunityIdentityReader 取得 id/className，不复制校园班级，也不向消费者泄露学号、真实姓名或完整班级；nickname 仅在当前用户资料契约额外返回。
Discover、Treehole、Messaging、Notifications 只依赖 CommunityProfileReader 批量取得 `{ id, displayName, avatarUrl }`，不得 JOIN users/community_profiles；Community 不反向依赖这些消费者。
昵称与头像元数据落在 community_profiles；两字段以原子 patch 独立更新，头像切换返回被替换 URL 并在确认全表无引用后清理。旧 `{id}.webp` 可继续读取，新上传使用不可变 UUID 文件名以保证 DB 失败补偿和长期缓存正确。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
