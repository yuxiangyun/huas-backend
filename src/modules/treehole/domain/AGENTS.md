# domain/
> L2 | 父级: /src/modules/treehole/AGENTS.md

成员清单
ports.ts: 定义 TreeholePersistence 事实边界及图片批次生命周期、用户/管理私有读取端口
operations-query.ts: 面向 Operations 的后台帖子/评论稳定只读查询契约
treehole.ts: 定义含存储中立图片元数据的稳定 DTO、严格 UUID/文件名、Unicode code point 内容校验、LIKE 元字符转义及公共作者视图

架构决策
domain 只表达稳定业务语义，不依赖 Hono、Drizzle、Bun 或 Node 文件系统；图片事实不保存 URL，前台与后台分别经媒体 reader 投影私有路径且只暴露 Community 公共作者。

开发规范
不在 domain 中加入数据库选择器、文件路径或 HTTP 状态码；错误消息保持既有中文契约。
图片数量、单图与整批原始字节在解码前校验；存储元数据严格限制为 01.webp 至 09.webp，不接纳可执行路径片段。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
