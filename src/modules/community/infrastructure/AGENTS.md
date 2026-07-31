# infrastructure/
> L2 | 父级: /src/modules/community/AGENTS.md

成员清单
sqlite-community-profile-repository.ts: 构造注入 Drizzle db 的 community_profiles 批量读取、字段级事务 patch、被替换头像返回与引用校验 adapter
community-avatar-media-storage.ts: 共享图片转换器驱动的本地头像压缩、不可变文件存储、补偿删除与公开读取 adapter

架构决策
SQLite adapter 只访问 Community 自有表且不 JOIN users；patch 短事务只覆盖提交字段并原子捕获本次替换的旧头像。媒体 adapter 只公开数据库当前引用的头像文件，路径解析拒绝遍历和非约定文件名。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
