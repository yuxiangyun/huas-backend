# application/
> L2 | 父级: /src/modules/identity/AGENTS.md

成员清单
login.ports.ts: 登录用例外部能力端口，以 commitRealSchoolLogin 明确分离真实 CAS 上下文提交与本服务 JWT 签发，并隔离上游、SQLite、密码、资料与运行时
login-application.service.ts: 登录应用服务，编排本地快捷、保真验证码、Portal/JW 激活与 JWT；CAS 成功后先提交真实登录上下文，只有至少一个学校系统激活成功才签发服务 JWT；Portal HTTP 5xx 的无 token 结果仍继续 JW 激活，既有网络超时异常保持中止语义

架构决策
应用服务只依赖 ports 与领域类型；验证码状态由用例实例持有，学校会话只能以端口定义的快照跨请求恢复，过期淘汰由生产装配按固定 TTL 周期显式触发。
用户与本次 CAS/Portal/JW 凭证必须通过 IdentityStorePort 一次提交；提交由 CAS 成功触发，不依赖激活/JWT 结果，资料回填失败被显式降级。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
