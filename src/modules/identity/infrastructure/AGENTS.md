# infrastructure/
> L2 | 父级: /src/modules/identity/AGENTS.md

成员清单
sqlite-identity.store.ts: IdentityStorePort 的 SQLite 实现，只读取本地身份并更新活跃时间，真实认证写入由 SchoolAccess 负责。
sqlite-identity-operations-query.ts: IdentityOperationsQueryPort 的 SQLite 实现，封装用户筛选、年级解析、活跃口径与 CAS/Portal/JW 基础凭证及缓存计数
sqlite-community-identity-reader.ts: CommunityIdentityReader 的构造注入 SQLite 实现，只批量投影 users.id/className
login-composition.ts: 绑定 SchoolAccess、Portal 资料补全、密码匹配、本地身份读取和 JWT；资料任务后台失败统一记录且不阻塞登录。

架构决策
Identity 只经 SchoolAccess 公开认证入口消费已提交身份；Campus Integrations 不反向依赖 Identity。
管理查询 adapter 只读身份管理快照并返回稳定 DTO，凭证指标只统计 CAS/Portal/JW 基础凭证，不把交互登录标记、学校登录 epoch 或模块派生会话暴露为凭证；Operations 不得下探 users/credentials/cache schema。
Community 身份 adapter 只提供默认 displayName 所需的最小投影，昵称、头像和公开资料不归 Identity 所有。
Identity 组合层只构造用例和单次资料补全任务，不自行创建 timer；进程级周期生命周期由 runtime 注册器持有。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
