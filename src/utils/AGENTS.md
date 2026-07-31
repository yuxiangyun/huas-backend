# utils/
> L2 | 父级: /src/AGENTS.md

成员清单
crypto.ts: 认证密码学适配器，以 RSA 保护 CAS 提交、解析票据 token，并用 AES-GCM 保护本地静默重认证密码
discover.ts: Discover 领域常量、类型和纯函数的旧工具路径兼容 Facade
errors.ts: API 错误码与 AppError 契约源
fallback-error.ts: 主备上游错误选择工具，用于返回更具体的兜底错误
http-log.ts: HTTP 日志细节上下文工具，管理 `_httpLog` 约定键
image.ts: 无状态图片处理边界，按真实内容识别主流图片格式并统一执行 EXIF 旋转、inside/cover 缩放、HEIC 兜底与 WebP 编码
logger.ts: 控制台与文件日志统一门面，封装 winston 与 DailyRotateFile
response.ts: 统一成功/失败 JSON 响应工具，管理 `_resMeta` 约定键
time.ts: 北京时区日期、ISO 与周起始工具

架构决策
utils 默认无状态、无业务副作用；image.ts 只统一图片解码与转换，Discover、Community、Messaging 各自保留存储、权限和生命周期 adapter；discover.ts 只为旧调用方再导出 modules/discover/domain，不再保存领域规则副本。

开发规范
新增工具必须有两个以上真实调用点；只有一个调用点的 helper 留在本地模块。

变更日志
2026-07-31: 抽取共享无状态图片转换边界，供 Discover、Community 与 Messaging 的媒体 adapter 分阶段接入。
2026-07-27: Discover 常量与纯函数迁入 modules/discover/domain，旧工具路径保留单向 Facade。
2026-06-30: 播种 utils L2 地图，记录 `_resMeta` 与 `_httpLog` 上下文键。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
