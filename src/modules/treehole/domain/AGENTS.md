# domain/
> L2 | 父级: /Users/xiangyun/workspace/huas-wechat-app/huas-server/src/modules/treehole/AGENTS.md

成员清单
ports.ts: 定义 TreeholePersistence 与 TreeholeAvatarStorage 两个外部边界契约
treehole.ts: 定义稳定 DTO、分页/内容校验及匿名公共视图与真实作者管理视图映射

架构决策
domain 只表达稳定业务语义，不依赖 Hono、Drizzle、Bun 或 Node 文件系统；前台与后台响应类型分离以防身份泄露。

开发规范
不在 domain 中加入数据库选择器、文件路径或 HTTP 状态码；错误消息保持既有中文契约。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
