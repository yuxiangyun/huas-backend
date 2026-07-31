# infrastructure/
> L2 | 父级: /src/modules/identity/AGENTS.md

成员清单
legacy-campus-login.adapter.ts: Campus Integrations canonical AuthEngine/TicketExchanger/CredentialManager/UserService 的登录端口适配器
sqlite-identity.store.ts: IdentityStorePort 的 SQLite/Drizzle 实现，以单事务提交用户与学校凭证
sqlite-identity-operations-query.ts: IdentityOperationsQueryPort 的 SQLite 实现，封装用户筛选、年级解析、活跃口径与凭证/缓存计数
sqlite-community-identity-reader.ts: CommunityIdentityReader 的构造注入 SQLite 实现，只批量投影 users.id/className
login-composition.ts: 登录应用服务装配，绑定加密、JWT、运行时与配置；后台清理由根周期任务注册器统一调度

架构决策
legacy adapter 是 Identity 到校园集成的单向端口适配层；Campus Integrations 不得反向依赖 Identity，替换上游协议时 application 不应发生变化。
SQLite store 独占登录写事务；交互恢复标记的删除与 CAS/Portal/JW upsert 同事务提交，杜绝部分身份事实可见。
管理查询 adapter 只读身份管理快照并返回稳定 DTO，Operations 不得下探 users/credentials/cache schema。
Community 身份 adapter 只提供默认 displayName 所需的最小投影，昵称、头像和公开资料不归 Identity 所有。
Identity 组合层只构造用例，不自行创建 timer；进程级周期生命周期由 runtime 注册器持有。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
