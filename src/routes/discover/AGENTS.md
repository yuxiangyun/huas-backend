# discover/
> L2 | 父级: /Users/xiangyun/workspace/huas-wechat-app/huas-server/src/routes/AGENTS.md

成员清单
discover.routes.ts: Discover HTTP 兼容 Facade，默认再导出 modules/discover/http canonical 子路由

依赖关系
discover.routes.ts -> modules/discover/http/discover.routes.ts

架构决策
旧路由目录不再承载 HTTP 实现，只维持 routes/index.ts 的既有装配路径；multipart、JSON 与 query 解析已迁入 canonical HTTP 层。
路由返回错误码和中文错误消息是外部契约，抽象公共 helper 前必须证明语义完全一致。
UGC 合规模式开启时，routes/index.ts 中间件认证后拦截 GET 请求（/meta 除外）；discoverMockText 非空时公共列表/详情返回一条分享美食纯文本虚拟内容，discoverMockText 为空时列表与评论返回空分页，写操作不受影响。

开发规范
修改 discover.routes.ts 时同步 L3 头部；新增 Discover 子路由必须先写清挂载路径和认证要求。
涉及推荐、评分、评论计数、媒体可见性的路由改动必须跑 discover 测试。

变更日志
2026-07-27: Discover HTTP 实现迁入 modules/discover/http，旧文件退化为单向 Facade。
2026-07-01: 记录 UGC 合规热开关对 GET 路由的认证后 mock/空态，保持列表分页契约。
2026-06-30: 播种 Discover 路由 L2 地图，补齐 HTTP 边界文档。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
