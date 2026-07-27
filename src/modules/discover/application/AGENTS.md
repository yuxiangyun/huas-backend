# application/
> L2 | 父级: /Users/xiangyun/workspace/huas-wechat-app/huas-server/src/modules/discover/AGENTS.md

成员清单
discover-application-service.ts: 构造注入 persistence/media ports，编排帖子、评论、评分、推荐、补偿删除与管理删除用例

架构决策
application 只依赖 domain 与共享错误/日志门面；SQLite 和媒体实现只能由上层 composition 注入。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
