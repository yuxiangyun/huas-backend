# identity/
> L2 | 父级: /Users/xiangyun/workspace/huas-wechat-app/huas-server/src/modules/AGENTS.md

成员清单
application/: 登录用例编排与外部能力 ports，不感知 HTTP、Drizzle 或运行时实现
domain/: 登录用户、学校凭证与结果语义，表达身份领域稳定语言
infrastructure/: SQLite、CAS/JW/Portal、密码加密与 JWT 的旧系统适配层
http/: `/auth/login` 的请求校验、限流、日志和响应映射

架构决策
Identity 先迁移登录纵向切片；学校集成仍由 legacy adapter 桥接既有实现，持久化则以单一 SQLite 事务提交用户与本次学校凭证。
Portal 资料回填属于非关键增强，必须发生在提交事务之后且失败不影响 JWT 签发。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
