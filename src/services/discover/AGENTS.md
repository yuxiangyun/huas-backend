# discover/
> L2 | 父级: /Users/xiangyun/workspace/huas-wechat-app/huas-server/src/services/AGENTS.md

成员清单
discover-admin-service.ts: 管理侧 Discover 写服务，软删除帖子并清理媒体文件，依赖 db/schema 与 media-service
discover-service.ts: Discover 兼容门面，维持路由层既有调用入口，转发到用户侧与管理侧服务
discover-shared.ts: Discover 领域共享内核，集中类型、分页、校验、Drizzle 选择器与响应组装纯函数
discover-user-service.ts: 用户侧 Discover 业务编排器，处理发帖、列表、详情、评论、删除、评分与推荐
media-service.ts: Discover 媒体边界，压缩/存储/删除图片并按帖子可见性公开读取文件

依赖关系
discover-service.ts -> discover-user-service.ts + discover-admin-service.ts
discover-user-service.ts -> discover-shared.ts + media-service.ts + db/schema
discover-admin-service.ts -> media-service.ts + db/schema
media-service.ts -> sharp/heic-convert + data/discover + db/schema
discover-shared.ts -> config + db/schema + utils/discover + utils/time

架构决策
共享文件只放无状态规则和结构转换；数据库事务、媒体副作用和路由错误语义保留在服务编排器。
门面服务继续存在，用稳定入口隔离内部拆分，避免路由层感知职责重排。

开发规范
修改任一成员时先更新 L3 头部，再检查本文件成员清单；新增文件必须说明职责、依赖和在依赖图中的位置。
推荐算法改动必须跑 discover 测试；媒体服务改动必须验证图片写入、公开读取和删除后的不可访问。

变更日志
2026-06-30: 从 discover-user-service.ts 抽出 discover-shared.ts，消除超 800 行大文件坏味道且保持 public API 不变。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
