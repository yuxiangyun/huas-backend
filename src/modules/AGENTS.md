# modules/
> L2 | 父级: /Users/xiangyun/workspace/huas-wechat-app/huas-server/src/AGENTS.md

成员清单
identity/: 身份领域纵向切片，隔离登录应用编排、领域契约、基础设施适配与 HTTP 映射

架构决策
modules 采用按业务能力组织的纵向切片；切片内部依赖方向固定为 http/infrastructure → application → domain，application 只能通过 ports 访问外部系统与持久化。
旧 routes 与 services 在迁移期只允许单向委托给新模块，新模块不得反向依赖旧 route Facade。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
