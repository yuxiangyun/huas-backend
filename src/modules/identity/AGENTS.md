# identity/
> L2 | 父级: /src/modules/AGENTS.md

成员清单
application/: 登录用例编排与外部能力 ports，不感知 HTTP、Drizzle 或运行时实现
domain/: 登录用户、学校凭证、结果语义及面向 Operations/Community 的最小身份只读契约
infrastructure/: SQLite、CAS/JW/Portal、密码加密、JWT 与身份只读 adapters
http/: `/auth/login` 的请求校验、限流、日志、响应映射与注入式 analytics 观测端口

架构决策
Identity 先迁移登录纵向切片；学校集成仍由 legacy adapter 桥接既有实现，持久化则以单一 SQLite 事务提交用户与本次学校凭证。
Portal 资料回填属于非关键增强，必须发生在提交事务之后且失败不影响 JWT 签发。
Operations 只通过 IdentityOperationsQueryPort 获取用户、凭证与兼容缓存管理快照；Identity 不反向依赖 Operations。
Community 只通过 CommunityIdentityReader 批量获取 id/className，Identity 不保存昵称或头像。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
