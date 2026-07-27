# domain/
> L2 | 父级: /Users/xiangyun/workspace/huas-wechat-app/huas-server/src/modules/identity/AGENTS.md

成员清单
login.ts: 登录领域值对象，统一用户、学校步骤、凭证集合与应用结果语义
operations-query.ts: 面向 Operations 的用户指标、年级/专业分布、筛选分页与凭证/缓存计数只读契约

架构决策
领域层只描述身份事实与稳定只读契约，不引用框架、数据库或旧认证实现；HTTP 错误码由外层根据结果类型映射。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
