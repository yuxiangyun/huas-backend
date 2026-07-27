# treehole/
> L2 | 父级: /Users/xiangyun/workspace/huas-wechat-app/huas-server/src/modules/AGENTS.md

成员清单
application/: 树洞用例编排层，仅通过 ports 协调匿名社区、管理视图与头像媒体
domain/: 树洞纯领域模型，定义校验、分页、前台匿名响应、后台真实作者响应、外部端口与 Operations 只读查询契约
http/: Treehole canonical Hono 协议适配器，保持 /api/treehole 契约
infrastructure/: SQLite、Operations 管理只读查询与本地头像媒体 adapters，保存原 SQL、事务、图片和缓存语义
composition.ts: 唯一装配根，连接 application ports 与 SQLite/头像 adapters，并提供迁移期静态类名
legacy-shared.ts: composition-level 旧共享出口，恢复无 policy 参数规则签名与历史 SQL helper 导出

架构决策
Treehole 是独立匿名社区纵向切片；application 不知道 Hono、Drizzle、Bun 或文件系统，domain 不依赖 Hono/Drizzle/Bun/Node fs。
持久化只有一个 TreeholePersistence port，头像文件只有一个 TreeholeAvatarStorage port；不会为单条 select 伪造 Repository，也不与 Discover 共享数据库 helper。
前台帖子/评论仅映射匿名身份与头像；真实学号、姓名、班级只允许管理查询 adapter 映射。

开发规范
点赞幂等、评论/通知/计数与删除清理必须保留 SQLite 原事务边界及 SQL 顺序。
旧 routes/services 只能单向再导出 composition/http/domain，新模块禁止反向依赖 Facade。
legacy-shared.ts 只服务旧 Facade，canonical application/domain 禁止依赖该兼容层。
Operations 管理列表经 TreeholeOperationsQueryPort 读取，真实作者 SQL 仍封装在本模块 infrastructure。

变更日志
2026-07-27: 建立 Treehole http/application/domain/infrastructure 纵向切片并保留旧路径 Facade。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
