# http/
> L2 | 父级: /src/modules/treehole/AGENTS.md

成员清单
treehole.routes.ts: createTreeholeRoutes 注入式 Hono factory，映射 multipart 图文帖子、Bearer 私有媒体、评论及返回 `{postId, liked, likeCount}` 的 PUT/DELETE 幂等点赞
treehole-upload-gate.ts: Treehole 发帖 multipart 解析前的有界活跃/排队门禁，从入口阻断多个大请求同时占用小内存服务器

架构决策
HTTP 层只解析 ID、分页、受限 multipart 与 JSON 评论并包装响应/日志；发帖大请求必须在 formData 前取得有界 lease，Community 资料、头像和 Notifications 路由不属于本模块。

开发规范
协议变化必须补 treehole.test.ts；路由 factory 不得 import composition singleton 或运行时 config。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
