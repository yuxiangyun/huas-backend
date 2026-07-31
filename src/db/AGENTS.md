# db/
> L2 | 父级: /src/AGENTS.md

成员清单
index.ts: SQLite 运行期连接入口，只打开已存在数据库、执行当前 schema 只读校验并提供显式关闭，不拥有结构变更权
migrator.ts: migration 事务执行与版本记录内核，以结构化 fingerprint、元数据校验和 destructive 预检控制发布
migrations/: 不可变编号 migration 目录，保存 0001/0002 历史结构与 0003 社交 contract migration
repair.ts: Discover/Treehole 派生计数显式修复内核，支持无写入 dry-run 与幂等事务更新
schema.ts: 全局 Drizzle 类型相，声明 Identity、Community、Discover、Treehole、Notifications、Messaging 与分析事实表
snapshot.ts: 部署前 SQLite VACUUM INTO 快照内核，输出带时间、schema version 与 release 的一致性副本

架构决策
schema.ts 是类型相和查询相；migrations/ 是结构演进事实源；index.ts 只负责连接与只读校验，应用启动不得创建、补列或迁移数据库。
既有数据库只有与 0001 baseline 结构指纹完全同构时才允许 adoption；未知对象、缺失对象或定义漂移一律 fail closed。
昂贵派生计数校准属于显式 repair，数据库一致性副本属于部署前 snapshot，两者均不得隐藏在普通应用启动。
SQLite 业务表是用户、凭证、课表缓存、Community、Discover、Treehole、通知与私信的唯一事实源；Messaging 表在数据库层约束 UUID 长度、九图序位与 WebP 元数据，并以 sender/created_at 索引支持事务内 30 条/分钟复验，跨表参与者/游标归属由同一应用事务校验，文件系统只保存领域自有媒体。
analytics_daily_metrics 与 analytics_daily_users 只保存渠道化聚合事实，不复制用户或内容业务实体。
credentials 除三个学校凭证外，还承载无敏感值、无 TTL 的 `interactive_login_required` 内部交互登录恢复标记。

开发规范
新增业务表必须同时更新 schema.ts、编号 migration 和相关测试。
migration 只向前且不提供自动 down；contract migration 必须标记 destructive，经停流、快照与 `--allow-destructive` 明确授权后执行，已发布 migration 不得改写。

变更日志
2026-07-31: 新增 0003 社交 contract migration、destructive 预检与运行期只读 schema 校验，启动和 repair 不再拥有迁移权。
2026-07-29: 新增 0002 expand-only 迁移与 community_nickname 类型映射，社区昵称不覆盖校园真实姓名。
2026-07-27: 建立 0001 baseline、迁移记录与严格指纹 adoption；派生计数 repair 和部署前 snapshot 从普通启动中分离。
2026-07-12: 新增渠道每日指标与去重活跃用户事实表，为后台时间序列提供可信口径。
2026-07-12: 明确 credentials 的第四种内部值用于跨进程保存验证码恢复状态，不扩展公开凭证类型。
2026-06-30: 播种 db L2 地图，明确 schema 与运行期建表职责分离。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
