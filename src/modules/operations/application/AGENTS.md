# application/
> L2 | 父级: /src/modules/operations/AGENTS.md

成员清单
admin-dashboard-service.ts: 构造注入身份、Discover、公告、日志与系统端口，保持 Dashboard 响应聚合契约
community-admin-service.ts: 构造注入 Treehole 只读/私有媒体 ports 与 Discover/Treehole 命令端口，编排后台社区管理与帖子图片读取
messaging-admin-service.ts: 只依赖 MessagingOperationsQueryPort 的会话翻页/增量、消息与带审计上下文私有媒体只读用例

架构决策
application 不导入 db/schema 或跨领域 infrastructure；Dashboard 与 Messaging 管理入口只消费事实所属领域公开端口，分页、年级、作者映射和媒体权限留在对应领域 adapter。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
