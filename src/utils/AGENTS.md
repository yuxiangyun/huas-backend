# utils/
> L2 | 父级: /Users/xiangyun/workspace/huas-wechat-app/huas-server/src/AGENTS.md

成员清单
crypto.ts: 认证密码学适配器，以 RSA 保护 CAS 提交、解析票据 token，并用 AES-GCM 保护本地静默重认证密码
discover.ts: Discover 领域常量与轻工具，包含分类、标签、作者标签和 JSON 数组解析
errors.ts: API 错误码与 AppError 契约源
fallback-error.ts: 主备上游错误选择工具，用于返回更具体的兜底错误
http-log.ts: HTTP 日志细节上下文工具，管理 `_httpLog` 约定键
logger.ts: 控制台与文件日志统一门面，封装 winston 与 DailyRotateFile
response.ts: 统一成功/失败 JSON 响应工具，管理 `_resMeta` 约定键
time.ts: 北京时区日期、ISO 与周起始工具

架构决策
utils 默认无状态、无业务副作用；discover.ts 是当前保留的领域工具例外，未来只有出现跨领域污染时才迁移回 services/discover。

开发规范
新增工具必须有两个以上真实调用点；只有一个调用点的 helper 留在本地模块。

变更日志
2026-06-30: 播种 utils L2 地图，记录 `_resMeta` 与 `_httpLog` 上下文键。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
