# http/
> L2 | 父级: /Users/xiangyun/workspace/huas-wechat-app/huas-server/src/modules/identity/AGENTS.md

成员清单
login.dto.ts: `/auth/login` 请求 DTO 与最小结构校验，固定旧字段兼容面
auth.routes.ts: Identity 登录 Hono 适配器，负责 JSON/限流/日志/analytics 与应用结果到旧 HTTP 契约的映射

架构决策
HTTP 层不访问数据库或校园实现；LoginApplicationService 返回业务结果，路由保留旧错误码、状态、验证码响应和失败限流时机。
旧 `src/routes/auth/auth.routes.ts` 只再导出本路由，依赖方向保持旧 Facade → Identity。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
