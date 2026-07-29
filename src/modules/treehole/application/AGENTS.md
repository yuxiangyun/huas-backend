# application/
> L2 | 父级: /Users/xiangyun/workspace/huas-wechat-app/huas-server/src/modules/treehole/AGENTS.md

成员清单
treehole-application-service.ts: 构造注入 persistence/avatar ports，编排校验、分页、化名用户、管理删除与社区昵称/头像用例

架构决策
application 只消费 domain 与 ports；输入标准化发生在持久化之前，原子计数和通知维护整体留在 SQLite adapter。

开发规范
不得直接 import infrastructure；新增外部副作用先证明是真实边界，再扩展最小 port。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
