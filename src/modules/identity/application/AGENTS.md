# application/
> L2 | 父级: /src/modules/identity/AGENTS.md

成员清单
login.ports.ts: 登录用例外部能力端口，隔离学校上游、恢复标记、SQLite、密码、JWT、资料回填与时钟/ID
login-application.service.ts: 登录应用服务，编排本地快捷、保真验证码失败原因、Portal/JW 激活、原子持久化、资料回填和 JWT，并暴露验证码会话周期清理入口

架构决策
应用服务只依赖 ports 与领域类型；验证码状态由用例实例持有，学校会话只能以端口定义的快照跨请求恢复，过期淘汰由生产装配按固定 TTL 周期显式触发。
用户与本次 CAS/Portal/JW 凭证必须通过 IdentityStorePort 一次提交，资料回填失败被显式降级。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
