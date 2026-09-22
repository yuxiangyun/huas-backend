# identity/
> L2 | 父级: /src/modules/AGENTS.md

成员清单
application/: 登录用例编排与外部能力 ports，不感知 HTTP、Drizzle 或运行时实现
domain/: 登录用户、结果语义及面向 Operations/Community 的最小身份只读契约
infrastructure/: SQLite、SchoolAccess 认证组合、资料补全调度、密码匹配、JWT 与身份只读 adapters
http/: `/auth/login` 的请求校验、限流、日志、响应映射与注入式 analytics 观测端口

架构决策
Identity 先迁移登录纵向切片；学校认证与条件提交由 SchoolAccess 负责，Identity 只读取本地身份、匹配密码和签发 JWT。
CAS 成功立即完成本服务登录；姓名或班级缺失时发出不阻塞登录的资料补全请求，Portal/JW 业务能力仍按需恢复。
Operations 只通过 IdentityOperationsQueryPort 获取用户、凭证与兼容缓存管理快照；Identity 不反向依赖 Operations。
Community 只通过 CommunityIdentityReader 批量获取 id/className，Identity 不保存昵称或头像。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
