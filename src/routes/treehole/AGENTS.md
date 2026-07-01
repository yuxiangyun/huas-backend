# treehole/
> L2 | 父级: /Users/xiangyun/workspace/huas-wechat-app/huas-server/src/routes/AGENTS.md

成员清单
treehole.routes.ts: 树洞 HTTP 适配器，处理 meta、头像、通知、帖子、点赞、评论与删除

架构决策
树洞不经过学校上游；路由只处理匿名社区 HTTP 契约，业务事实和计数维护交给 TreeholeService。
UGC 合规模式开启时，routes/index.ts 中间件认证后拦截 GET 请求（/meta 除外）；treeholeMockText 非空时公共列表/详情返回一条神秘角落纯文本虚拟内容，treeholeMockText 为空时列表与评论返回空分页，头像/未读数返回空对象，写操作不受影响。

开发规范
头像媒体、通知、评论计数和删除可见性改动必须跑 treehole 测试。

变更日志
2026-07-01: 记录 UGC 合规热开关对 GET 路由的认证后 mock/空态，保持分页、头像、未读数响应契约。
2026-06-30: 播种 treehole 路由 L2 地图。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
