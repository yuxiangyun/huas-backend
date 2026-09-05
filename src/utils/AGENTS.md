# utils/
> L2 | 父级: /src/AGENTS.md

成员清单
crypto.ts: 认证密码学适配器，以 RSA 保护 CAS 提交、解析票据 token，并用 AES-GCM 保护本地静默重认证密码
discover.ts: Discover 领域常量、类型和纯函数的旧工具路径兼容 Facade
errors.ts: API 错误码与 AppError 契约源
fallback-error.ts: 主备上游错误选择工具，用于返回更具体的兜底错误
http-log.ts: HTTP 日志细节上下文工具，管理 `_httpLog` 约定键
image.ts: 进程内单槽、sharp 单线程且禁用 libvips cache 的低内存图片边界，执行真实格式识别、像素/页数/动画门禁、受控 HEIC 兜底与严格字节上限 WebP 编码
ordered-commit.ts: 进程内按资源键协调并发读与串行提交，较新成功代次阻止旧结果覆盖，失败不抹除可用旧结果且空闲释放状态
logger.ts: 控制台与文件日志统一门面，封装 winston 与 DailyRotateFile
private-media-response.ts: Treehole/Messaging 用户与管理私有 WebP 的 no-store、nosniff 安全响应构造器
request-body-limit.ts: Hono 请求体上限门禁，统一校验 Content-Length、限制流式读取并为 multipart 预留固定协议开销
response.ts: 统一成功/失败 JSON 响应工具，管理 `_resMeta` 约定键
time.ts: 北京时区日期、ISO 与周起始工具

架构决策
utils 默认无业务副作用；request-body-limit.ts 统一上传解析前门禁但由调用方提供业务容量与错误文案；image.ts 以进程内单槽队列约束 sharp 解码峰值，只统一图片安全门禁与转换，业务模块各自保留存储、权限和生命周期 adapter；discover.ts 只为旧调用方再导出 modules/discover/domain，不再保存领域规则副本。

开发规范
新增工具必须有两个以上真实调用点；只有一个调用点的 helper 留在本地模块。

变更日志
2026-08-01: 图片边界增加总解码像素/页数/动画门禁、严格输出字节上限、有界自适应压缩、受控 HEIC JPEG 兜底，并以进程单槽、sharp 单线程和禁用 libvips cache 收敛 512MB 机器峰值与常驻内存。
2026-08-01: 抽取声明长度与流式请求统一门禁，Discover、Community、Messaging 共享 multipart 请求上限范式。
2026-07-31: 抽取共享无状态图片转换边界，供 Discover、Community 与 Messaging 的媒体 adapter 分阶段接入。
2026-07-27: Discover 常量与纯函数迁入 modules/discover/domain，旧工具路径保留单向 Facade。
2026-06-30: 播种 utils L2 地图，记录 `_resMeta` 与 `_httpLog` 上下文键。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
