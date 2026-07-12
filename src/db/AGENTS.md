# db/
> L2 | 父级: /Users/xiangyun/workspace/huas-wechat-app/huas-server/src/AGENTS.md

成员清单
index.ts: SQLite 运行期入口，创建连接、建表、补齐遗留列、回填关键时间戳并导出 getDb/initDatabase/schema
schema.ts: Drizzle 表结构类型相，声明 users、credentials、cache、discover、treehole 与每日分析事实表

架构决策
schema.ts 是类型相和查询相；index.ts 是运行期建表与轻迁移相。两者重复表字段不是冗余 bug，而是 SQLite 无迁移环境下的启动自愈边界。
SQLite 业务表是用户、凭证、课表缓存、Discover、Treehole 的唯一事实源；文件系统只保存媒体。
analytics_daily_metrics 与 analytics_daily_users 只保存渠道化聚合事实，不复制用户或内容业务实体。
credentials 除三个学校凭证外，还承载无敏感值、无 TTL 的 `interactive_login_required` 内部交互登录恢复标记。

开发规范
新增业务表必须同时更新 schema.ts、initDatabase 建表 SQL、遗留列补齐策略和相关测试。
运行期迁移只允许做幂等补齐，不做破坏性 DDL。

变更日志
2026-07-12: 新增渠道每日指标与去重活跃用户事实表，为后台时间序列提供可信口径。
2026-07-12: 明确 credentials 的第四种内部值用于跨进程保存验证码恢复状态，不扩展公开凭证类型。
2026-06-30: 播种 db L2 地图，明确 schema 与运行期建表职责分离。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
