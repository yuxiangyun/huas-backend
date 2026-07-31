# domain/
> L2 | 父级: /src/modules/treehole/AGENTS.md

成员清单
ports.ts: 定义 TreeholePersistence 事实持久化边界契约
operations-query.ts: 面向 Operations 的后台帖子/评论稳定只读查询契约
treehole.ts: 定义稳定 DTO、分页/内容校验及统一 Community 公共作者的前台/管理视图映射

架构决策
domain 只表达稳定业务语义，不依赖 Hono、Drizzle、Bun 或 Node 文件系统；前台与后台都只暴露 Community 公共作者，不泄露校园身份。

开发规范
不在 domain 中加入数据库选择器、文件路径或 HTTP 状态码；错误消息保持既有中文契约。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
