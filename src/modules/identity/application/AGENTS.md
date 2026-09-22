# application/
> L2 | 父级: /src/modules/identity/AGENTS.md

成员清单
login.ports.ts: SchoolAccess 学校认证、本地身份读取、密码匹配、JWT、资料补全请求和时钟端口，不暴露学校客户端或凭证。
login-application.service.ts: 本地快捷或学校真实认证后的本服务登录结果，立即签 JWT，并在姓名或班级缺失时请求后台补全。

架构决策
本地快捷仍受交互标记约束，不推进学校 epoch 或清除冷却。真实学校认证、挑战与身份条件提交归 SchoolAccess；Identity 仅消费已提交身份。姓名与班级缺省不影响成功结果，响应保留 user 对象并发出尽力补全请求；补全失败不得改变登录结果。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
