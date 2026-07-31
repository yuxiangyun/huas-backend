# http/
> L2 | 父级: /src/modules/identity/AGENTS.md

成员清单
login.dto.ts: `/auth/login` 请求 DTO 与最小结构校验，固定旧字段兼容面
auth.routes.ts: Identity 登录 Hono 适配器，负责 JSON/限流/日志与错误映射，并向根周期注册器暴露同一登录应用实例
login-analytics.ts: 登录结果观测端口，由 Operations composition 注入同步 analytics recorder，避免 Identity 反向依赖管理模块

架构决策
HTTP 层不访问数据库、校园或 Operations 实现；LoginApplicationService 返回业务结果，路由保留旧错误码、状态、验证码响应和失败限流时机。
验证码会话清理不在模块 import 时创建 timer，由 runtime 周期任务注册器统一持有进程生命周期。
旧 `src/routes/auth/auth.routes.ts` 只再导出本路由，依赖方向保持旧 Facade → Identity。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
