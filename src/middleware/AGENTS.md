# middleware/
> L2 | 父级: /Users/xiangyun/workspace/huas-wechat-app/huas-server/src/AGENTS.md

成员清单
academic-refresh-rate-limit.middleware.ts: 教务 refresh 内存限流，保护学校上游免受强制刷新轰炸
admin-basic-auth.middleware.ts: 管理 Basic Auth 边界，从 ADMIN_USERNAME/ADMIN_PASSWORD 读取凭据并在缺失时拒绝 /api/admin 与 /status 访问
auth-login-rate-limit.middleware.ts: 登录失败内存限流，按学号和客户端 IP 构造 key，降低暴力尝试风险
auth.middleware.ts: Bearer JWT 认证边界，解析用户身份并刷新 lastActiveAt
error.middleware.ts: 全局错误语义翻译层，把 AppError/异常转换为统一 JSON 响应
logging.middleware.ts: 请求日志中间件，收集耗时、身份、响应元信息和 HTTP 细节

架构决策
中间件只处理横切边界：认证、限流、错误、日志；业务判断进入 services，响应结构进入 utils/response。
Hono 私有上下文键 `_resMeta`、`_httpLog` 是日志约定键，写入点必须集中在 response/http-log 工具。

开发规范
新增上下文变量必须扩展 Hono ContextVariableMap；新增私有键必须在本文件记录语义。
限流逻辑保持内存态，不作为业务事实源。

变更日志
2026-07-10: 移除管理凭据硬编码，改为环境变量注入、缺失即关闭的认证边界。
2026-06-30: 登录限流 key 从单学号升级为学号加客户端 IP，并由 auth 路由显式闭环失败/成功状态。
2026-06-30: 播种 middleware L2 地图，明确横切关注点边界。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
