# treehole/
> L2 | 父级: /src/modules/AGENTS.md

成员清单
application/: 树洞用例编排层，仅通过 persistence port 协调公开内容、用户帖子与管理行为
domain/: 树洞纯领域模型，定义校验、分页、统一公共作者响应、外部端口与 Operations 只读查询契约
http/: Treehole 注入式 Hono factory，提供帖子、公共用户帖子、点赞、评论和作者删除协议
infrastructure/: 构造注入 SQLite adapters，查询 Treehole 事实并经 CommunityProfileReader 批量投影作者
composition.ts: 无全局状态模块工厂，接收 db/profile reader/policy/Notifications Outbox 与投影 ports，并产出 service、routes 与 Operations query

架构决策
Treehole 是实名绑定但沿用“树洞”产品名称的独立内容切片；application 不知道 Hono/Drizzle，domain 只依赖 Community 公共作者类型。
持久化只有一个 TreeholePersistence port；资料与头像完全归 Community，Treehole 仅经 Notifications 窄端口原子写活动 Outbox 并在提交后触发投影，不保留兼容入口。
所有内容响应显式携带 `{ id, displayName, avatarUrl }`，SQLite adapter 不 JOIN users/community_profiles，只在事实分页完成后批量投影作者。

开发规范
点赞幂等、自赞门禁、评论计数与删除清理必须保留 SQLite 事务边界。
Operations 管理列表经 TreeholeOperationsQueryPort 读取内容事实与公共作者，不暴露校园敏感身份。

变更日志
2026-07-31: 完全取消匿名与模块内资料/头像/旧通知职责，统一 Community 作者 DTO，新增公共用户帖子接口并改为全构造注入。
2026-07-31: 删除 Treehole 旧 routes/services 过渡出口，生产装配直接使用 canonical 模块。
2026-07-27: 建立 Treehole http/application/domain/infrastructure 纵向切片并保留旧路径 Facade。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
