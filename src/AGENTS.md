# src/
> L2 | 父级: /Users/xiangyun/workspace/huas-wechat-app/huas-server/AGENTS.md

成员清单
auth/: 认证与上游凭证交换，收敛 CAS、Portal、JW 子凭证与本服务 JWT
core/: 底层 HTTP 与重试能力，供服务层访问学校上游
db/: SQLite/Drizzle 数据层，定义业务事实表、初始化与轻量迁移补齐
middleware/: Hono 中间件，处理认证、限流、日志、错误与管理 Basic Auth
parsers/: 上游 HTML/JSON 解析器，只做格式转换，不触碰业务持久化
routes/: Hono 路由层，解析 HTTP 输入并调用服务层，不承载核心业务规则
runtime/: 进程运行态，暴露健康、关闭与就绪状态
services/: 业务服务层，编排规则、事务、缓存、媒体与上游访问
types/: 第三方库声明补丁，隔离外部类型缺口
utils/: 共享工具，封装响应、错误、日志、时间、加密与 Discover 小工具
config.ts: 运行时配置入口，从环境变量生成强类型配置对象
index.ts: Hono 应用入口，装配中间件、静态资源、路由、清理任务与 Bun server

架构决策
src 是应用机器相核心；routes 只接 HTTP，services 执行业务，db 保存事实，parsers 翻译上游格式，utils 不反向依赖业务模块。
任何跨层调用都必须单向向内：入口装配 routes，routes 调 services，services 调 db/parsers/core，底层模块不得反向知道 HTTP。

开发规范
业务文件必须有 L3 INPUT/OUTPUT/POS 头部；新增目录必须补 L2 AGENTS.md 并回链本文件。
新增共享能力先放在最窄模块内，出现真实跨模块复用再上移到 utils 或 core。

变更日志
2026-06-30: 播种 src L2 地图，补齐 services 父级文档锚点。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
