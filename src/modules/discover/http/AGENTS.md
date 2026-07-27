# http/
> L2 | 父级: /Users/xiangyun/workspace/huas-wechat-app/huas-server/src/modules/discover/AGENTS.md

成员清单
discover.routes.ts: /api/discover 的 Hono 子路由，解析 multipart/JSON/query 并映射既有响应、日志与中文错误

架构决策
HTTP 层保留参数解析和协议错误；分类、内容、标签、图片、评分与评论规则交由 application/domain。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
