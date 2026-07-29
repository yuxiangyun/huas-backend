# tests/
> L2 | 父级: /Users/xiangyun/workspace/huas-wechat-app/huas-server/AGENTS.md

成员清单
academic-refresh-rate-limit.test.ts: 学业接口强制刷新频率限制回归测试
academic-compat.test.ts: Academic canonical composition 与旧 services Facade 的运行时引用一致性测试
admin-dashboard-activity.test.ts: 管理后台活跃度、显式渠道优先级与历史 unknown 隔离口径回归测试
admin-session.test.ts: 后台 HttpOnly Cookie 会话建立、保护与撤销回归测试
analytics-batch.test.ts: Analytics 内存聚合、active user 去重、单事务 flush、失败回并重试与 shutdown 回归测试
auth-login-rate-limit.test.ts: 登录失败限流策略回归测试
business-flows.test.ts: 核心业务流薄聚合入口，在独立 Bun 进程内装配 business-flows/ 能力用例并维持模块 mock 隔离
business-flows/: 登录、凭证、课表/日历、缓存与持久化边界的共享支架和细分能力用例
cache-modernization.test.ts: Cache 永久/限时新鲜度、版本 envelope、旧 payload、同意图 singleflight 与 observer 隔离回归测试
calendar-compat.test.ts: Calendar canonical 实现与 routes/services/auth 旧 Facade 的引用、token 别名与 HMAC 语义兼容测试
campus-integrations-compat.test.ts: Campus Integrations canonical 实现与 auth/core/parsers/services 旧 Facade 的引用一致性测试
database-migrations.test.ts: SQLite 空库初始化、baseline adoption、漂移拒绝、中断恢复、repair 与部署快照回归测试
deployment-scripts.test.ts: 维护中部署脚本的 Bash 语法、readiness、锁文件包管理器与 nginx 回滚回归测试
classroom-free-parser.test.ts: 空教室解析器回归测试
discover.test.ts: Discover 薄聚合入口，在单进程内装配 discover/ 媒体、推荐、评论与管理合规用例
discover/: Discover HTTP/媒体共享支架及按业务能力细分的回归用例
discover-application.test.ts: Discover application 媒体补偿与删除清理失败语义回归测试
discover-compat.test.ts: Discover canonical composition 与旧 routes/services/media Facade 的运行时引用一致性测试
e2e.live.test.ts: 真实上游端到端验证入口
e2e.setup.ts: 端到端测试环境初始化
evaluation-parser.test.ts: 教评解析、actionable/blocked 状态、有界续批、提交响应与抗重排批末回查测试
fixtures/: 测试二进制样本目录，包含 HEIC 图片
grade-parser.test.ts: 成绩表结构、合法空表、错误页拒绝与评教门禁回归测试
identity-login-application.test.ts: Identity/Login 应用编排、验证码固定周期清理、CAS 提交耗时、Portal/JW 分支与 SQLite 用户凭证原子回滚测试
operations-application.test.ts: Operations Dashboard 构造注入与纯端口聚合隔离测试
operations-compat.test.ts: Operations canonical 与旧 routes/services/runtime/middleware Facade 引用及依赖方向测试
portal-schedule-parser.test.ts: Portal 日期范围、课表解析及数字/字符串 code、一卡通余额边界回归测试
public-announcements.test.ts: 公告公共接口回归测试
runtime-check-ci.test.ts: 本地 check 脚本、单 job CI、触发器、并发取消与 observer 装配静态回归测试
runtime-health-metrics.test.ts: live/ready 状态矩阵、轻量指标、校园 HTTP 结果观察与有界 shutdown hooks 回归测试
schedule-parser.test.ts: JW 真实结构、非教学周、登录页与嵌套课程节点去重回归测试
schedule-source-policy.test.ts: 课表来源热策略、请求快照、current/stale 固定顺序、legacy 错误优先级、持久化锁接管与管理鉴权回归测试
setup.ts: 单元与业务流测试数据库、环境变量初始化
treehole.test.ts: Treehole 薄聚合入口，在单进程内装配 treehole/ 社区资料、交互、管理与合规用例
treehole/: Treehole HTTP/事务/社区资料共享支架及按业务能力细分的回归用例
treehole-compat.test.ts: Treehole canonical composition/http 与旧 routes/services/media Facade 引用及依赖方向测试
upstream-retry.test.ts: 上游请求/凭证恢复的次数与 deadline、成绩临时错误分类、非重试错误、CAS HTTP/维护页及 Portal 换票瞬态网络语义回归测试

架构决策
测试默认隔离学校真实网络，以 mock 边界验证业务编排；e2e.live.test.ts 是唯一真实上游入口。
凭证正确性测试必须同时覆盖普通静默恢复、验证码持久标记、真实登录清除和 3003 穿透缓存边界。
进程级 `mock.module` 不能与其他套件共享模块缓存；由 `scripts/test.ts` 独立调度，普通数据库套件保持单并发。

开发规范
业务代码变更先跑对应定向测试，再跑 `bun test --preload ./tests/setup.ts` 全量回归。
新增、删除或重命名测试文件时同步更新本地图。

变更日志
2026-07-29: 将 Business Flows、Discover 与 Treehole 超限套件拆为薄聚合入口、共享支架和 `.cases.ts` 能力用例，保留进程级 mock 与 SQLite 隔离语义。
2026-07-27: 增加部署脚本 readiness、Web 构建选择和 nginx 原子切流静态回归。
2026-07-27: 新增 Runtime live/ready、Prometheus 指标、上游观察、shutdown flush 与精简 CI 回归。
2026-07-27: 新增 Analytics 批量写、失败重试、observer 隔离与 shutdown flush 回归。
2026-07-27: 新增 Cache schema 兼容、TTL=0、singleflight、stale fallback 与旁路指标观察回归。
2026-07-27: 新增 Operations application 端口隔离、旧出口引用一致性与依赖方向回归。
2026-07-27: 新增 Discover 旧路径与 canonical 模块引用一致性回归。
2026-07-27: 新增 Treehole 旧路径引用一致性与模块依赖方向回归。
2026-07-27: 新增 Calendar 旧路径引用一致性与 token/HMAC 兼容回归。
2026-07-27: 新增 Campus Integrations Facade 引用一致性测试，并将 business flow mock 边界切换到 canonical 模块。
2026-07-27: 新增 Academic Facade 引用一致性测试，并将 refresh 限流 mock 边界切换到 canonical composition。
2026-07-27: 新增 Identity/Login 应用服务与 SQLite 事务失败回滚定向测试。
2026-07-16: 成绩/一卡通拒绝错误页和缺失余额，课表限定日期并去重嵌套节点，CAS/Portal 超时与维护页保持真实故障语义。
2026-07-16: 评教测试覆盖 HTTP 200 错误页拒绝、提交后列表确认与本次/累计计数分离。
2026-07-16: 日历订阅补齐中文长文本 UTF-8 75-octet 折行与无损展开回归。
2026-07-16: 后台洞察测试补齐显式渠道优先、旧小程序无头兼容与历史 unknown 不回填边界。
2026-07-12: 新增后台 Cookie 会话安全属性与撤销测试。
2026-07-12: Discover/Treehole 管理接口测试改走后台 Cookie 会话，不再构造 Basic Auth 头。
2026-07-12: 播种 tests L2 地图，补充验证码恢复与缓存穿透测试边界。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
