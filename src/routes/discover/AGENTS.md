# discover/
> L2 | 父级: /Users/xiangyun/workspace/huas-wechat-app/huas-server/src/routes/AGENTS.md

成员清单
discover.routes.ts: Discover HTTP 适配器，解析帖子、评论、评分、删除与 meta 请求，调用 services/discover 门面并写入 HTTP 日志细节

依赖关系
discover.routes.ts -> services/discover/discover-service.ts
discover.routes.ts -> utils/response + utils/errors + utils/http-log + utils/discover

架构决策
multipart 图片、JSON 评论/评分、分页 query 的解析停留在路由层；分类、标签、内容、图片数量和业务权限校验由服务层执行。
路由返回错误码和中文错误消息是外部契约，抽象公共 helper 前必须证明语义完全一致。
UGC 合规模式开启时，routes/index.ts 中间件认证后拦截 GET 请求（/meta 除外）；discoverMockText 非空时公共列表/详情返回一条分享美食纯文本虚拟内容，discoverMockText 为空时列表与评论返回空分页，写操作不受影响。

开发规范
修改 discover.routes.ts 时同步 L3 头部；新增 Discover 子路由必须先写清挂载路径和认证要求。
涉及推荐、评分、评论计数、媒体可见性的路由改动必须跑 discover 测试。

变更日志
2026-07-01: 记录 UGC 合规热开关对 GET 路由的认证后 mock/空态，保持列表分页契约。
2026-06-30: 播种 Discover 路由 L2 地图，补齐 HTTP 边界文档。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
