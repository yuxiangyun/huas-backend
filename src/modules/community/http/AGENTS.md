# http/
> L2 | 父级: /src/modules/community/AGENTS.md

成员清单
community.routes.ts: createCommunityRoutes 注入式 Hono factory，提供当前资料查询/修改、头像删除与公共用户详情

架构决策
HTTP adapter 依赖应用服务而非 composition singleton；认证由上层 `/api` 边界统一执行，响应不返回 nickname/className/studentId/name 等非公共字段。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
