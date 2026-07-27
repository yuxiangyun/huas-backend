# db/
> L2 | 父级: /Users/xiangyun/workspace/huas-wechat-app/huas-server/src/AGENTS.md

成员清单
index.ts: SQLite 运行期兼容入口，创建连接并委托版本化 migration；保留一版 initDatabase 与关键时间戳补正，不再执行派生计数全表修复
migrator.ts: migration 事务执行与版本记录内核，基于结构化 schema 指纹严格控制 baseline adoption 和漂移拒绝
migrations/: 不可变编号 migration 目录，保存 0001 baseline 与唯一版本注册表
repair.ts: Discover/Treehole 派生计数显式修复内核，支持无写入 dry-run 与幂等事务更新
schema.ts: Drizzle 表结构类型相，声明 users、credentials、cache、discover、treehole 与每日分析事实表
snapshot.ts: 部署前 SQLite VACUUM INTO 快照内核，输出带时间、schema version 与 release 的一致性副本

架构决策
schema.ts 是类型相和查询相；migrations/ 是结构演进事实源；index.ts 只负责连接装配与兼容调用。结构变化必须使用只前进、可事务恢复的编号 migration。
既有数据库只有与 0001 baseline 结构指纹完全同构时才允许 adoption；未知对象、缺失对象或定义漂移一律 fail closed。
昂贵派生计数校准属于显式 repair，数据库一致性副本属于部署前 snapshot，两者均不得隐藏在普通应用启动。
SQLite 业务表是用户、凭证、课表缓存、Discover、Treehole 的唯一事实源；文件系统只保存媒体。
analytics_daily_metrics 与 analytics_daily_users 只保存渠道化聚合事实，不复制用户或内容业务实体。
credentials 除三个学校凭证外，还承载无敏感值、无 TTL 的 `interactive_login_required` 内部交互登录恢复标记。

开发规范
新增业务表必须同时更新 schema.ts、编号 migration 和相关测试。
migration 只允许 expand-contract 前向演进，不提供自动 down，不执行破坏性 DDL；已发布 migration 不得改写。

变更日志
2026-07-27: 建立 0001 baseline、迁移记录与严格指纹 adoption；派生计数 repair 和部署前 snapshot 从普通启动中分离。
2026-07-12: 新增渠道每日指标与去重活跃用户事实表，为后台时间序列提供可信口径。
2026-07-12: 明确 credentials 的第四种内部值用于跨进程保存验证码恢复状态，不扩展公开凭证类型。
2026-06-30: 播种 db L2 地图，明确 schema 与运行期建表职责分离。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
