# src/
> L2 | 父级: /Users/xiangyun/workspace/huas-wechat-app/huas-server/AGENTS.md

成员清单
auth/: 本服务 JWT/日历签名与校园认证兼容 Facade，学校凭证实现已迁入 modules/campus-integrations
core/: 学校 HTTP、重试与端点的兼容 Facade，canonical 实现位于 modules/campus-integrations
db/: SQLite/Drizzle 数据层，定义业务事实表、版本化 migration、显式 repair 与一致性 snapshot
middleware/: Hono 中间件，处理认证、限流、日志、错误与后台 Cookie 会话
modules/: 按业务能力组织的纵向切片，承载 Identity、Campus Integrations、Academic、Cache、Calendar、Discover、Treehole 与 Operations canonical 实现
parsers/: 学校解析器兼容 Facade，canonical 纯解析器位于 modules/campus-integrations
routes/: Hono 路由层，解析 HTTP 输入并调用服务层，不承载核心业务规则
runtime/: 进程运行态与 Operations UGC 策略兼容 Facade，承载就绪判定、轻量指标与有界关闭 hooks
services/: 迁移期业务兼容层，Academic/Calendar/Discover/Treehole/Operations 已迁领域只保留单向 Facade
types/: 第三方库声明补丁，隔离外部类型缺口
utils/: 共享工具，封装响应、错误、日志、时间、加密与 Discover 小工具
config.ts: 运行时配置入口，从环境变量生成强类型配置对象
index.ts: Hono 应用入口，装配中间件、静态资源、路由、指标 observer、清理任务、关闭 flush 与 Bun server

架构决策
src 是应用机器相核心；新业务按 modules 纵向切片，旧 routes 只接 HTTP，services 执行业务，db 保存事实，parsers 翻译上游格式，utils 不反向依赖业务模块。
任何跨层调用都必须单向向内：入口装配 routes，routes 调 services/modules，旧 Facade 单向再导出 Campus Integrations，底层模块不得反向知道 HTTP route。

开发规范
业务文件必须有 L3 INPUT/OUTPUT/POS 头部；新增目录必须补 L2 AGENTS.md 并回链本文件。
新增共享能力先放在最窄模块内，出现真实跨模块复用再上移到 utils 或 core。

变更日志
2026-07-27: Runtime 增加 live/ready/metrics、Analytics 有界关闭 flush 与本地/CI 单链质量门。
2026-07-27: 新增 Cache 纵向切片，显式固化 TTL=0 永久语义、版本 envelope 与同意图 singleflight，旧缓存服务退化为 Facade。
2026-07-27: 新增 Operations 纵向切片，后台管理、批量 analytics、公告、日志、UGC 策略、会话与健康检查迁入 canonical 模块。
2026-07-27: 新增 Treehole 纵向切片，匿名社区、管理视图、SQLite 事务与头像媒体迁入 modules/treehole。
2026-07-27: 新增 Discover 纵向切片，帖子、评论、评分、推荐与媒体职责迁入 modules/discover。
2026-07-27: 新增 Calendar 纵向切片，签名、周快照与 ICS 统一迁入 modules/calendar。
2026-07-27: 新增 Academic 纵向切片，课表、成绩、评教与空教室旧服务退化为单向兼容 Facade。
2026-07-27: 新增 Campus Integrations 纵向切片，旧 auth/core/parsers 与 Portal 资料服务退化为兼容 Facade。
2026-07-27: 新增 modules/identity 登录纵向切片，旧 auth route 退化为单向兼容 Facade。
2026-06-30: 播种 src L2 地图，补齐 services 父级文档锚点。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
