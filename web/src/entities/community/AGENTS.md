# community/
> L2 | 父级: /Users/xiangyun/workspace/huas-wechat-app/huas-server/web/AGENTS.md

成员清单
api/community-api.ts: `/api/community` 当前资料读写、头像清除与指定用户公共资料传输边界
api/community-queries.ts: Community 当前/公共资料缓存及跨内容、消息、通知作者投影失效编排
model/community-query-keys.ts: Community 当前资料与指定公共用户查询键命名源
model/community-types.ts: Community 公共资料的前端稳定契约，供 Treehole、Messaging 与 Notifications 共享作者投影

架构决策
CommunityProfile 是跨社交领域唯一的公开人物形状；业务实体只引用该类型，不复制 id/displayName/avatarUrl 字段组合。
当前用户资料写入后同步刷新自身公共缓存，并失效 Discover、Treehole、Messaging 与 Notifications 作者投影；Community 只依赖各域查询键，不依赖其请求实现。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
