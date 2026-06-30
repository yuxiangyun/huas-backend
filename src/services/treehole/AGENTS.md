# treehole/
> L2 | 父级: /Users/xiangyun/workspace/huas-wechat-app/huas-server/src/services/AGENTS.md

成员清单
treehole-admin-service.ts: 管理侧树洞服务，查询真实作者并软删除帖子/评论
treehole-avatar-media-service.ts: 树洞头像媒体服务，压缩、存储、删除并公开读取头像
treehole-service.ts: 树洞兼容门面，转发到用户侧、管理侧与头像媒体服务
treehole-shared.ts: 树洞共享内核，集中类型、分页、选择器、响应转换、计数和通知 helper
treehole-user-service.ts: 用户侧树洞服务，处理发帖、列表、点赞、评论、通知和作者删除

架构决策
树洞与 Discover 一样是独立社区支线，不经过学校上游；匿名前台响应和管理真实作者视图必须分离。

开发规范
计数、通知、头像媒体、删除可见性变更必须跑 treehole 测试。

变更日志
2026-06-30: 播种 treehole 服务 L2 地图。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
