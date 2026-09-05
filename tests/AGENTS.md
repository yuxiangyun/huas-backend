# tests/
> L2 | 父级: /AGENTS.md

成员清单
academic-refresh-rate-limit.test.ts: 学业/Portal 强制刷新共享桶与 classrooms/evaluation 固定实时回源独立桶回归测试
academic-compat.test.ts: Academic canonical composition 与旧 services Facade 的运行时引用一致性测试
admin-dashboard-activity.test.ts: 管理后台活跃度、仅 CAS/Portal/JW 基础凭证计数、显式渠道优先级与历史 unknown 隔离口径回归测试
admin-session.test.ts: 后台 HttpOnly Cookie 会话建立、无自动过期、保护与撤销回归测试
analytics-batch.test.ts: Analytics 内存聚合、active user 去重、单事务 flush、失败回并重试与 shutdown 回归测试
auth-login-rate-limit.test.ts: 登录失败限流策略回归测试
app-factory.test.ts: 注入式 Hono 应用工厂、Web 分层缓存、私有 API no-store、媒体端口与启动入口无隐式 migration 回归测试
activity-outbox-integration.test.ts: Discover 点赞与 Treehole 评论的事实/计数/Outbox 同事务失败回滚，以及提交后投影失败重试门禁
business-flows.test.ts: 核心业务流薄聚合入口，在独立 Bun 进程内装配 business-flows/ 能力用例并维持模块 mock 隔离
business-flows/: 登录、凭证及五秒恢复冷却、课表/日历、缓存与持久化边界的共享支架和细分能力用例
cache-modernization.test.ts: Cache 永久/限时新鲜度、数据时间/LRU 访问时间分离、版本 envelope、快照条件失效、singleflight 与 observer 隔离回归测试
calendar-compat.test.ts: Calendar canonical 实现与 routes/services/auth 旧 Facade 的引用、token 别名与 HMAC 语义兼容测试
campus-integrations-compat.test.ts: Campus Integrations canonical 实现与 auth/core/parsers/services 旧 Facade 的引用一致性测试
database-migrations.test.ts: SQLite destructive 授权、0003 核心守恒/旧事实丢弃、0004 Treehole 媒体列与唯一索引、schema fail-ready、repair 与快照测试
early-rising.test.ts: Early Rising 时间窗、幂等打卡、未来趋势拒绝、有界连续积分、展示设置与本地/远程 mock seed 清理回归测试
deployment-scripts.test.ts: 维护发布脚本的 Bash 语法、首页弹窗成组备份白名单、release 保留、停流前磁盘门禁、PM2 直接 Bun 启动、destructive migration、本机冒烟与 forward-fix 回归测试
classroom-free-parser.test.ts: 空教室目标结构、合法空态、通用错误页拒绝、过滤规则与延后 JW 登录表单会话恢复回归测试
community.test.ts: Community 缺省名称、昵称校验、DTO 隔离、并发字段 patch、头像引用保护、宽限期孤儿回收与媒体生命周期回归测试
discover.test.ts: Discover 薄聚合入口，在单进程内装配 discover/ 媒体、推荐、评论与管理用例
discover/: Discover HTTP/媒体共享支架及按业务能力细分的回归用例
discover-application.test.ts: Discover application 媒体补偿、删除清理失败语义与孤儿清理委托回归测试
e2e.live.test.ts: 真实上游端到端验证入口，支持单独运行移动教务课表/缓存/坏令牌恢复，并覆盖登录/JW 恢复与 mobile-yxt 账单、电费只读 DTO 及 epoch 绑定无 TTL 派生会话
e2e.setup.ts: 真实上游测试隔离环境与临时 SQLite 显式迁移入口
evaluation-parser.test.ts: 教评解析、延后 JW 登录表单、actionable/blocked 状态、有界续批、提交响应、未确认 unknown 与抗重排批末回查测试
fixtures/: 测试二进制样本目录，包含 HEIC 图片
grade-parser.test.ts: 成绩表结构、HTTP 200 登录页会话失效、合法空表、错误页拒绝与评教门禁回归测试
identity-login-application.test.ts: Identity/Login 应用编排、验证码固定周期清理、CAS 提交耗时、Portal/JW 分支与 SQLite 用户凭证原子回滚测试
image.test.ts: 共享图片 sharp 无缓存单线程资源策略、真实格式识别、输入/像素/页数边界、EXIF 清理、动画策略、安全 HEIC fallback 与严格输出上限回归测试
index-popup.test.ts: 首页弹窗启停/时间窗、三态底栏/旧配置兼容、动作内容版本、multipart 校验、公开 null、原子设置与最近三版不可变媒体回归测试
notifications.test.ts: Notifications 差异回复事件、Outbox 幂等/撤销/退避/双层失败隔离、ID 增量、摘要校准与永久保留回归测试
messaging.test.ts: Messaging 延迟会话/目标定位、会话高水位、严格 UUID 图文幂等、三态消息、未读与私有媒体测试
messaging-timestamps.test.ts: Messaging 慢图片/快文本并发提交时间与 repository 会话时间单调回归测试
messaging-upload.test.ts: Messaging HTTP 上传边界，锁定混合字段图片线序、解析前 413 与坏 multipart 的稳定 400
mobile-jw.test.ts: 真实 500+401、SSO 同源/Portal 条件失效、会话单飞/epoch/generation、TGC 清理竞态、基础临时故障保持原错误且五秒后恢复、临时错误预算及真实日期/缓存/解析合同回归
mobile-yxt.test.ts: 登录 epoch/Portal 401/200 HTML 恢复、generation 条件失效、Cookie 白名单、Bun/Node 传输错误归一化、账单 freshness/有符号 totals、真实电费合同、同键回源合流、Portal/JW/限流隔离、24 月/6 键 LRU 与旧 `/api/ecard` 合同专项回归
mobile-yxt-auth-state.test.ts: 严格派生命名空间、损坏/越权 CookieJar 事务淘汰、自动重建、合法会话读取及 Cookie/accessToken 低敏感错误日志专项反例
social-upload-limits.test.ts: Discover/Community HTTP 上传边界，锁定声明长度、流式及无关字段请求在 formData 前统一返回 413
social-summary-routes.test.ts: Social 私信/互动未读单请求并行聚合与稳定响应字段回归测试
messaging-admin.test.ts: 管理员 Cookie 会话增量/三态消息/图片只读、三类隐私安全审计、禁止写命令、参与者媒体权限与四类清理任务装配测试
operations-application.test.ts: Operations Dashboard 构造注入与纯端口聚合隔离测试
operations-compat.test.ts: Operations canonical 与旧 routes/services/runtime/middleware Facade 引用及依赖方向测试
periodic-tasks.test.ts: Runtime 轻量周期任务注册、幂等启停、失败隔离与同任务防重叠回归测试
portal-schedule-parser.test.ts: Portal 日期范围、结构完整空表/缺载荷协议错误、数字/字符串 code、非成功错误与一卡通余额边界回归测试
public-announcements.test.ts: 公告公共接口回归测试
runtime-check-ci.test.ts: Bun 测试临时库默认 preload、本地 check 脚本、单 job CI、触发器、并发取消与 observer 装配静态回归测试
runtime-health-metrics.test.ts: live/ready 状态矩阵、普通/增量轮询 quiet 日志、轻量指标、校园 HTTP 结果观察与有界 shutdown hooks 回归测试
schedule-parser.test.ts: JW 真实结构、非教学周、登录页与嵌套课程节点去重回归测试
schedule-source-policy.test.ts: 课表三种来源热策略与 Admin 写入读回、请求快照、缺载荷时 JW fallback、current/stale 固定顺序、legacy 错误优先级、持久化锁接管与管理鉴权回归测试
setup.ts: 单元与业务流测试环境初始化，并在模块装载前显式迁移隔离 SQLite
social-database.ts: 跨 Community/Discover/Treehole/Notifications/Messaging 套件的外键有序清理 helper，显式解除会话游标循环引用后清空社交与身份事实
treehole.test.ts: Treehole 薄聚合入口，在单进程内装配 treehole/ 公共作者、低内存私有媒体、交互与管理用例
treehole/: Treehole HTTP/事务/Community 作者投影与私有图片共享支架，按帖子、媒体、交互和管理能力细分回归用例
web-social-state.test.ts: 无 DOM 验证私信单一目标/历史合并、资料/详情 URL 互斥、basename 归一化、上传格式、Discover 排序/分页失效与通知 total 校准规则
web-cache-policy.test.ts: Web 标准/引用/后台/强刷 Query 时间层级及高水位键有界回收策略测试
upstream-retry.test.ts: 上游请求/凭证恢复次数与 deadline、成绩临时错误、JW 主框架激活验证、CAS 结构化拒绝、HTTP 维护页及 Portal 换票瞬态网络语义回归测试

架构决策
测试默认隔离学校真实网络，以 mock 边界验证业务编排；e2e.live.test.ts 是唯一真实上游入口。
项目级 bunfig.toml 默认 preload tests/setup.ts，确保直接 bun test 与编排入口都先切换到临时 SQLite；E2E 由 CLI preload 覆盖为专用隔离环境。
凭证正确性测试必须同时覆盖普通静默恢复、验证码持久标记、真实登录清除和 3003 穿透缓存边界。
进程级 `mock.module` 不能与其他套件共享模块缓存；由 `scripts/test.ts` 独立调度，普通数据库套件保持单并发。

开发规范
业务代码变更先跑对应定向测试，再跑 `bun test --preload ./tests/setup.ts` 全量回归。
新增、删除或重命名测试文件时同步更新本地图。

变更日志
2026-08-01: 首页弹窗补齐 public_account/text/none 三态底栏、旧配置兼容、动作内容版本与公开 DTO 端到端契约测试。
2026-08-01: 共享图片测试补齐 sharp 无缓存单线程资源策略、总解码像素、动图/页数拒绝、元数据清理、严格输出上限的成功自适应与有限失败语义。
2026-08-01: 新增 Treehole multipart-only 私有图片、低内存压缩门禁、双认证读取、失败补偿与孤儿回收回归。
2026-08-01: 新增 Discover/Community 上传解析前门禁、Community 并发字段 patch/头像引用保护与 Outbox 失败写回隔离回归。
2026-08-01: 项目级 Bun 测试配置默认加载隔离 SQLite setup，阻止直接执行单测时误清理 data/huas.db。
2026-07-31: 新增 Community 专项测试，锁定重复昵称、默认 displayName、公共 DTO 与不可变头像媒体边界。
2026-07-31: 新增共享图片工具回归，覆盖真实内容识别、32MB 单图边界语义与主流手机图片转换。
2026-07-31: 收敛跨社交切片测试数据库清理顺序，避免共享 users 外键导致套件间污染。
2026-07-31: 新增 Notifications 专项测试，锁定逐 recipient 事件幂等、Outbox 重试/撤销与 Community actor 投影边界。
2026-07-31: 新增跨模块 Activity Outbox 原子性测试，以真实 writer 写入后失败证明互动事实、计数与事件共同回滚。
2026-07-31: 新增 Messaging 模块与 Operations 跨模块测试，锁定私信事务、限流、媒体权限、管理只读和日志保密边界。
2026-07-31: 测试 preload 显式迁移临时库，覆盖 0003 destructive 门禁、数据守恒和 v2 启动拒绝，不再调用运行期 initDatabase。
2026-07-29: 覆盖 CAS 登录提交的结构化错误提取，防止静态验证码文案吞掉真实密码错误。
2026-07-29: 将 Business Flows、Discover 与 Treehole 超限套件拆为薄聚合入口、共享支架和 `.cases.ts` 能力用例，保留进程级 mock 与 SQLite 隔离语义。
2026-07-27: 增加部署脚本 readiness、Web 构建选择和 nginx 原子切流静态回归。
2026-07-27: 新增 Runtime live/ready、Prometheus 指标、上游观察、shutdown flush 与精简 CI 回归。
2026-07-27: 新增 Analytics 批量写、失败重试、observer 隔离与 shutdown flush 回归。
2026-07-27: 新增 Cache schema 兼容、TTL=0、singleflight、stale fallback 与旁路指标观察回归。
2026-07-27: 新增 Operations application 端口隔离、旧出口引用一致性与依赖方向回归。
2026-07-31: 删除 Discover/Treehole 旧 Facade 兼容测试与内容空读用例，测试支架直接依赖 canonical 模块。
2026-07-27: 新增 Calendar 旧路径引用一致性与 token/HMAC 兼容回归。
2026-07-27: 新增 Campus Integrations Facade 引用一致性测试，并将 business flow mock 边界切换到 canonical 模块。
2026-07-27: 新增 Academic Facade 引用一致性测试，并将 refresh 限流 mock 边界切换到 canonical composition。
2026-07-27: 新增 Identity/Login 应用服务与 SQLite 事务失败回滚定向测试。
2026-07-16: 成绩/一卡通拒绝错误页和缺失余额，课表限定日期并去重嵌套节点，CAS/Portal 超时与维护页保持真实故障语义。
2026-08-23: mobile-yxt 专项以最终数据库/Cookie/缓存/限流状态锁定真实登录竞态、Portal/JW 隔离、第二次 401、严格空态、缓存放大与旧余额 HTTP 合同。
2026-08-23: 电费 fixture 对齐官方 config.location code→account.templateList 调用合同，补齐 nullable、模板重排/扩展、低敏感诊断及 HTTP 200 协议失败不清会话/不 stale 回退。
2026-08-24: mobile-yxt 传输错误归一化读取 Bun/Node cause 链与运行时错误码，瞬时连接失败允许既有账单/电费缓存 stale 降级，未知解析异常仍失败关闭。
2026-08-24: 以真实旧 Portal JWT fixture 锁定 host/open 的 HTTP 200 HTML 无 tid 凭证拒绝，触发按值条件失效与一次 Portal-only 恢复；JSON 200 未知合同仍失败关闭。
2026-07-16: 评教测试覆盖 HTTP 200 错误页拒绝、提交后列表确认与本次/累计计数分离。
2026-07-16: 日历订阅补齐中文长文本 UTF-8 75-octet 折行与无损展开回归。
2026-07-16: 后台洞察测试补齐显式渠道优先、旧小程序无头兼容与历史 unknown 不回填边界。
2026-07-12: 新增后台 Cookie 会话安全属性与撤销测试。
2026-07-12: Discover/Treehole 管理接口测试改走后台 Cookie 会话，不再构造 Basic Auth 头。
2026-07-12: 播种 tests L2 地图，补充验证码恢复与缓存穿透测试边界。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
