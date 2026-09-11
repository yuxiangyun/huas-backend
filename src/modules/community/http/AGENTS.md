# http/
> L2 | 父级: /src/modules/community/AGENTS.md

成员清单
community.routes.ts: createCommunityRoutes(service, uploadPolicy) 注入式 Hono factory，在解析前限制资料 multipart，以 PUT 和微信原生上传所需 POST 共享资料更新边界，并用替换意图拒绝头像文件静默丢失；同时提供当前资料查询、头像删除与公共用户详情。

架构决策
HTTP adapter 依赖应用服务和注入的头像容量而非 composition singleton；声明长度与无长度流式请求共享解析前 413 门禁。认证由上层 `/api` 边界统一执行，`/profile` 仅额外披露当前用户 nickname，`/users/:id` 不返回 nickname/className/studentId/name 等非公共字段。
头像更新必须携带 `avatarIntent=replace` 与非空 `avatar` 文件，POST 缺少该意图会被拒绝；该意图只用于验证传输完整性，不进入 Community 资料 patch。微信原生 `uploadFile` 固定 POST，因此资料更新同时接受 POST；普通文本与 Web FormData 继续使用 PUT。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
