# src/
> L2 | 父级: /AGENTS.md

成员清单
auth/: 本服务 JWT/日历签名与校园认证兼容 Facade，学校凭证实现已迁入 modules/campus-integrations
core/: 学校 HTTP、重试与端点的兼容 Facade，canonical 实现位于 modules/campus-integrations
db/: SQLite/Drizzle 数据层，定义业务事实表、版本化 migration、显式 repair 与一致性 snapshot
middleware/: Hono 中间件，处理认证、限流、日志、错误与后台 Cookie 会话
modules/: 按业务能力组织的纵向切片，承载 Identity、Community、Early Rising、Campus Integrations、Academic、Cache、Calendar 与各社交/运维业务实现
parsers/: 学校解析器兼容 Facade，canonical 纯解析器位于 modules/campus-integrations
routes/: Hono 协议与认证边界，接收根组合注入的 Community/Discover/Early Rising/Treehole/Notifications/Messaging/Operations 路由实例
runtime/: 进程运行态，承载就绪判定、轻量指标、有界关闭 hooks 与四类独立孤儿媒体周期任务
services/: 学校业务与 Operations 的迁移期兼容层；Discover/Treehole 旧 Facade 已物理删除
types/: 第三方库声明补丁，隔离外部类型缺口
utils/: 共享无状态工具，封装响应、错误、日志、时间、加密、请求体门禁与跨媒体图片转换
config.ts: 运行时配置入口，从环境变量生成强类型配置对象，包含课表来源策略、共享状态路径、学校回源总预算、社交媒体宽限期与只能下调的 Treehole 低内存压缩/排队安全上限
app.ts: 注入式 Hono 应用工厂，装配全局中间件、路由、私有 API no-store、静态 Web 分层缓存与媒体端点但不监听端口
composition.ts: 唯一跨模块组合根，用同一 DB 实例连接 Community、Early Rising、Discover、Treehole、Notifications、Messaging 与 Operations 公开 ports，并集中装配 HTTP、后台展示设置、Social 聚合未读、首页弹窗及社交私有/公共媒体、观测器、四类独立孤儿媒体周期任务与关闭钩子
index.ts: 纯进程入口，只执行只读 schema 校验、Bun.serve、周期任务启停、信号与有界关闭

架构决策
src 是应用机器相核心；新业务按 modules 纵向切片，旧 routes 只接 HTTP，services 执行业务，db 保存事实，parsers 翻译上游格式，utils 不反向依赖业务模块。
任何跨层调用都必须单向向内：index 只消费 app/composition，组合根连接各模块公开构造器，routes 调 modules，旧 Facade 单向再导出稳定学校能力，底层模块不得反向知道进程入口。
应用启动没有 migration 权限；结构演进只能由部署阶段显式命令完成，schema 不匹配时必须在监听端口前失败。

开发规范
业务文件必须有 L3 INPUT/OUTPUT/POS 头部；新增目录必须补 L2 AGENTS.md 并回链本文件。
新增共享能力先放在最窄模块内，出现真实跨模块复用再上移到 utils 或 core。

变更日志
2026-07-31: 新增 Community 公共资料边界，昵称/头像与默认作者投影不再归属 Treehole 或 users 身份事实。
2026-07-27: Runtime 增加 live/ready/metrics、Analytics 有界关闭 flush 与本地/CI 单链质量门。
2026-07-31: 拆分 app/composition/index，应用启动改为只读 schema 校验，并用统一 periodic registry 收敛进程级清理任务。
2026-07-27: 新增 Cache 纵向切片，显式固化 TTL=0 永久语义、版本 envelope 与同意图 singleflight，旧缓存服务退化为 Facade。
2026-07-27: 新增 Operations 纵向切片，后台管理、批量 analytics、公告、日志、会话与健康检查迁入 canonical 模块。
2026-07-31: Discover/Treehole 旧 routes/services Facade 与内容空读运行态物理删除，路由装配直接依赖 canonical HTTP adapters。
2026-07-31: Treehole 取消匿名与资料/头像职责，Discover 以幂等点赞替代评分；二者统一通过 Community 批量投影公共作者并由根组合实例化。
2026-07-31: Discover/Treehole 互动事务接入 Notifications Outbox，请求后即时投影并由 periodic registry 重试；通知事实不自动清理。
2026-07-31: 新增 Messaging 一对一私信切片，根组合连接 Community/Operations、私有媒体与无主目录周期清理。
2026-08-01: Discover、Community 与 Treehole 分别按活跃引用/宽限期回收孤儿媒体，根组合按业务注册独立任务，避免单模块失败阻断其他清理。
2026-08-01: 根组合新增 Social 未读只读聚合，把 Messaging 计数与 Notifications 摘要并行投影到单一 HTTP 请求而不合并领域事实。
2026-08-01: Operations 新增单配置首页弹窗与公开不可变 WebP 媒体，配置/媒体跟随 DB 持久目录并由后台 Cookie 会话管理。
2026-08-02: Web HTTP 边界改为 HTML/非哈希文件弱 ETag 重验证、`/m/assets/*` 内容哈希一年 immutable，并对 API/认证响应统一声明 private no-store。
2026-07-27: 新增 Calendar 纵向切片，签名、周快照与 ICS 统一迁入 modules/calendar。
2026-07-27: 新增 Academic 纵向切片，课表、成绩、评教与空教室旧服务退化为单向兼容 Facade。
2026-07-27: 新增 Campus Integrations 纵向切片，旧 auth/core/parsers 与 Portal 资料服务退化为兼容 Facade。
2026-09-05: Campus Integrations 增加 mobile-jw token-only 派生会话与真实课表解析，Academic 新增移动教务优先策略；共享 Portal reader 与 TGC 条件提交隔离凭证依赖。
2026-08-23: Campus Integrations 新增 epoch 条件写的 mobile-yxt 自有派生会话、独立限流/有界月缓存、严格账单与电费只读能力，保持旧 `/api/ecard` 合同不变。
2026-08-24: Early Rising 纳入 canonical 模块地图，根组合将其 SQLite 展示设置端口注入 Operations 后台管理面。
2026-07-27: 新增 modules/identity 登录纵向切片，旧 auth route 退化为单向兼容 Facade。
2026-06-30: 播种 src L2 地图，补齐 services 父级文档锚点。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
