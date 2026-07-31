# http/
> L2 | 父级: /src/modules/community/AGENTS.md

成员清单
community.routes.ts: createCommunityRoutes(service, uploadPolicy) 注入式 Hono factory，在解析前限制资料 multipart，并提供当前资料查询/修改/头像删除与公共用户详情

架构决策
HTTP adapter 依赖应用服务和注入的头像容量而非 composition singleton；声明长度与无长度流式请求共享解析前 413 门禁。认证由上层 `/api` 边界统一执行，`/profile` 仅额外披露当前用户 nickname，`/users/:id` 不返回 nickname/className/studentId/name 等非公共字段。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
