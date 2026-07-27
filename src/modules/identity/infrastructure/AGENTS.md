# infrastructure/
> L2 | 父级: /Users/xiangyun/workspace/huas-wechat-app/huas-server/src/modules/identity/AGENTS.md

成员清单
legacy-campus-login.adapter.ts: Campus Integrations canonical AuthEngine/TicketExchanger/CredentialManager/UserService 的登录端口适配器
sqlite-identity.store.ts: IdentityStorePort 的 SQLite/Drizzle 实现，以单事务提交用户与学校凭证
sqlite-identity-operations-query.ts: IdentityOperationsQueryPort 的 SQLite 实现，封装用户筛选、年级解析、活跃口径与凭证/缓存计数
login-composition.ts: 登录应用服务装配，绑定加密、JWT、运行时与配置，并在生产实例上按旧固定周期调度验证码清理

架构决策
legacy adapter 是 Identity 到校园集成的单向端口适配层；Campus Integrations 不得反向依赖 Identity，替换上游协议时 application 不应发生变化。
SQLite store 独占登录写事务；交互恢复标记的删除与 CAS/Portal/JW upsert 同事务提交，杜绝部分身份事实可见。
管理查询 adapter 只读身份管理快照并返回稳定 DTO，Operations 不得下探 users/credentials/cache schema。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
