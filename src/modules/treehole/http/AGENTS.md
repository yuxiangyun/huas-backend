# http/
> L2 | 父级: /src/modules/treehole/AGENTS.md

成员清单
treehole.routes.ts: createTreeholeRoutes 注入式 Hono factory，映射帖子、评论及返回 `{postId, liked, likeCount}` 的 PUT/DELETE 幂等点赞

架构决策
HTTP 层只解析 ID、分页与 JSON 并包装响应/日志；Community 资料、头像和 Notifications 路由不属于本模块。

开发规范
协议变化必须补 treehole.test.ts；路由 factory 不得 import composition singleton 或运行时 config。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
