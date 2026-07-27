# discover/
> L2 | 父级: /Users/xiangyun/workspace/huas-wechat-app/huas-server/src/services/AGENTS.md

成员清单
discover-admin-service.ts: 管理删除类名兼容 Facade，再导出 modules/discover composition
discover-comment-service.ts: 评论类名兼容 Facade，再导出 canonical application 静态映射
discover-post-service.ts: 帖子类名兼容 Facade，并保留 infrastructure DiscoverPostQuery 旧出口
discover-recommendation-service.ts: 推荐类名兼容 Facade，再导出 canonical application 静态映射
discover-service.ts: Discover 总门面兼容 Facade，再导出 canonical application 静态类
discover-shared.ts: 旧类型、校验、分页与 selector 兼容 Facade
discover-user-service.ts: 用户门面与领域 DTO 兼容 Facade
media-service.ts: 媒体类与缓存头兼容 Facade，供 src/index.ts 保持旧装配路径

依赖关系
旧 services/discover/* -> modules/discover canonical exports

架构决策
本目录不保留业务实现；全部 Facade 必须单向指向 modules/discover，新模块不得反向依赖本目录。

开发规范
修改任一成员时先更新 L3 头部，再检查本文件成员清单；新增文件必须说明职责、依赖和在依赖图中的位置。
推荐算法改动必须跑 discover 测试；媒体服务改动必须验证图片写入、公开读取和删除后的不可访问。

变更日志
2026-07-27: Discover canonical 实现迁入 modules/discover，本目录全部退化为旧路径 Facade。
2026-07-16: 按帖子、评论、推荐与共享查询四条业务语义拆分用户服务，保留原门面、查询顺序、事务与返回语义。
2026-06-30: 从 discover-user-service.ts 抽出 discover-shared.ts，消除超 800 行大文件坏味道且保持 public API 不变。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
