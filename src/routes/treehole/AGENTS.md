# treehole/
> L2 | 父级: /Users/xiangyun/workspace/huas-wechat-app/huas-server/src/routes/AGENTS.md

成员清单
treehole.routes.ts: 树洞 HTTP 适配器，处理 meta、头像、通知、帖子、点赞、评论与删除

架构决策
树洞不经过学校上游；路由只处理匿名社区 HTTP 契约，业务事实和计数维护交给 TreeholeService。

开发规范
头像媒体、通知、评论计数和删除可见性改动必须跑 treehole 测试。

变更日志
2026-06-30: 播种 treehole 路由 L2 地图。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
