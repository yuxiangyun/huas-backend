# modules/
> L2 | 父级: /Users/xiangyun/workspace/huas-wechat-app/huas-server/src/AGENTS.md

成员清单
academic/: 学业领域纵向切片，承载课表、成绩、评教与空教室 application/domain/infrastructure
calendar/: 日历订阅纵向切片，承载签名、用户查询、Academic 课表编排与 RFC 5545 ICS
campus-integrations/: 学校 CAS、Portal、JW 防腐层，收敛 HTTP、凭证恢复、上游编排、资料服务与纯解析器唯一实现
discover/: 发现美食纵向切片，承载 HTTP、用例编排、稳定规则、SQLite 事务与本地媒体
identity/: 身份领域纵向切片，隔离登录应用编排、领域契约、基础设施适配与 HTTP 映射
treehole/: 匿名树洞纵向切片，承载 HTTP、用例编排、匿名/管理模型、SQLite 事务与头像媒体

架构决策
modules 采用按业务能力组织的纵向切片；切片内部依赖方向固定为 http/infrastructure → application → domain，application 只能通过 ports 访问外部系统与持久化。
旧 auth/core/parsers/routes/services 在迁移期只允许单向委托或再导出新模块，新模块不得反向依赖旧 Facade 或 routes。

变更日志
2026-07-27: 新增 Treehole 纵向切片，旧 routes/services 路径退化为兼容 Facade。
2026-07-27: 新增 Discover 纵向切片，旧 routes/services/utils 路径退化为兼容 Facade。
2026-07-27: 新增 Calendar 纵向切片，旧 routes/services/auth 日历实现退化为单向兼容 Facade。
2026-07-27: 新增 academic 纵向切片，旧 Academic/Portal 课表服务退化为兼容 Facade。
2026-07-27: 新增 campus-integrations，建立学校上游协议与凭证恢复的 canonical 防腐层。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
