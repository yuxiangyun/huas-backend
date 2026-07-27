# http/
> L2 | 父级: /Users/xiangyun/workspace/huas-wechat-app/huas-server/src/modules/treehole/AGENTS.md

成员清单
treehole.routes.ts: Treehole canonical Hono 路由，映射 meta、头像、通知、帖子、点赞、评论和删除协议

架构决策
HTTP 层只解析 ID、分页、JSON/multipart 输入并包装响应与日志；业务规则通过 composition 进入 application。
UGC 合规 mock/空态仍由未迁移的 routes/index.ts 在认证后拦截，本模块不复制该状态机。

开发规范
不得改变 /api/treehole 路径、分页字段、状态码与中文错误；协议变化必须补 treehole.test.ts。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
