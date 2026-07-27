# application/
> L2 | 父级: /Users/xiangyun/workspace/huas-wechat-app/huas-server/src/modules/operations/AGENTS.md

成员清单
admin-dashboard-service.ts: 构造注入身份、Discover、公告、日志与系统端口，保持 Dashboard 响应聚合契约
community-admin-service.ts: 构造注入 Treehole 只读 query port 与 Discover/Treehole 命令端口，编排后台社区管理

架构决策
application 不导入 db/schema 或跨领域 infrastructure；Dashboard 只合并端口返回的稳定 DTO，分页、年级与作者映射留在事实所属领域 adapter。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
