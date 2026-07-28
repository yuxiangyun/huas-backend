# HUAS Server 代码—文档可视化核对报告

> 核对范围：`src/`、`web/src/`、`tests/` 与 `docs/` 现有文档
>
> 事实基准：2026-07-18 当前工作区
>
> 方法：先按代码入口、路由、导入导出、环境变量和持久化结构建立事实，再对照架构、API、前端与运维文档；未运行项目、构建或测试

## 核心结论

1. 代码的主边界是清楚的：Bun/Hono 同时托管 React SPA、校园上游聚合 API、UGC、管理后台、媒体与日历订阅；校园服务与 UGC 共用身份和 SQLite，但上游依赖彼此隔离。[`src/index.ts`](src/index.ts)、[`src/routes/index.ts`](src/routes/index.ts)
2. 认证不是单一 CAS 调用，而是“本地快捷登录 / CAS 验证码 / Portal 与 JW 子凭证 / Self JWT”四层协作；凭证恢复还包含 TGC 交换、静默重认证、持久化交互标记和错误降级边界。[`src/routes/auth/auth.routes.ts`](src/routes/auth/auth.routes.ts)、[`src/auth/credential-manager.ts`](src/auth/credential-manager.ts)
3. 架构与 API 文档的最大漂移在管理面：代码已经从 Basic Auth 和 `/status` 迁移到环境变量账号、HttpOnly Cookie 会话与 `/api/admin/session`，但三份主文档仍描述旧实现。[`src/middleware/admin-session.middleware.ts`](src/middleware/admin-session.middleware.ts)、[`docs/architecture/ARCHITECTURE.md`](docs/architecture/ARCHITECTURE.md)、[`docs/api/API.md`](docs/api/API.md)
4. SQLite 实际有 12 张表，不是架构文档写的 10 张；新增的两张分析表及 `/api/admin/analytics/overview` 尚未进入主架构和 API 总契约。[`src/db/schema.ts`](src/db/schema.ts)、[`src/services/admin/analytics-service.ts`](src/services/admin/analytics-service.ts)
5. GEB 文件契约未完全落地：静态扫描的 208 个 TypeScript/TSX 文件中，125 个在文件头含 `[INPUT]`，83 个缺失；后端覆盖 81%，Web 仅 42%，测试 58%。这会削弱代码—文档双向校验能力。[`AGENTS.md`](AGENTS.md)

## 1. 运行时总览

总览图只负责导航。业务细节在后续模块图中展开。

![HUAS Server 运行时总览](assets/runtime-architecture.svg)

`/m` 的 React 应用和小程序共享同一套 Hono API。Bearer 业务路由下又分为两条性质不同的链：学业/门户服务依赖 CAS、Portal、JW 与凭证缓存；Discover/Treehole 直接访问 SQLite 和本地媒体，不依赖学校上游。管理路由使用独立 Cookie 会话，公开日历使用签名 URL。[`src/index.ts`](src/index.ts)、[`src/routes/index.ts`](src/routes/index.ts)、[`web/src/app/router/router.tsx`](web/src/app/router/router.tsx)

## 2. CAS 登录与本地快捷路径

![CAS 登录完整决策树](assets/cas-login-flow.svg)

这条链最重要的三个边界是：

- 本地快捷登录只在没有 `sessionId`、没有持久化交互标记且 AES 密码匹配时成立；成功后不访问学校系统。
- 验证码会话存于进程内 `Map`，最多 1000 条、10 分钟 TTL、读取一次即删除；重启或流量切到另一实例后无法继续二次提交。
- CAS 成功并不等于本服务登录成功。Portal Token 与 JW Session 至少一个必须可用，之后才写用户、学校凭证并签发 Self JWT。

依据：[`src/routes/auth/auth.routes.ts`](src/routes/auth/auth.routes.ts)、[`src/auth/auth-engine.ts`](src/auth/auth-engine.ts)、[`src/auth/ticket-exchanger.ts`](src/auth/ticket-exchanger.ts)。

## 3. 凭证重构与上游恢复

![学校凭证重构与上游恢复](assets/credential-recovery.svg)

有效子凭证直接使用；子凭证失效时先尝试用 TGC 交换，失败后才用数据库中的 AES 密码重跑 CAS。若 CAS 明确要求验证码，系统会删除三个学校凭证，并在 `credentials` 表写入无 TTL 的 `interactive_login_required` 标记，阻止后续静默流程绕过人工验证。

业务上游遇到瞬时网络错误会按配置退避重试；遇到 `SESSION_EXPIRED` 会删除目标凭证并重构一次。最终的 `3003` 是硬边界：[`fallbackOnRefreshFailure()`](src/services/infra/refresh-fallback.ts) 明确禁止用旧缓存掩盖需要重新登录的事实。

依据：[`src/auth/credential-manager.ts`](src/auth/credential-manager.ts)、[`src/services/infra/upstream.ts`](src/services/infra/upstream.ts)、[`src/services/infra/refresh-fallback.ts`](src/services/infra/refresh-fallback.ts)。

## 4. 课表双源、缓存与回退

![课表双源与回退决策树](assets/schedule-fallback.svg)

两个入口不是同一路径换名字：

- `/api/schedule` 以 JW 为主，失败时用同一自然周的 Portal 数据回退。
- `/api/v1/schedule` 以 Portal 为主；只有查询范围恰好是自然周时，Portal 失败才允许回退 JW，任意日期区间失败则返回原错误。
- “课表未公布”被规范化为 `200` 空课表。两源都失败后才选择错误；非 `3003` 错误且存在旧缓存时可以返回 `stale=true`，`3003` 不允许降级。

依据：[`src/services/academic/schedule-facade.ts`](src/services/academic/schedule-facade.ts)、[`src/services/academic/schedule-service.ts`](src/services/academic/schedule-service.ts)、[`src/services/portal/portal-schedule-service.ts`](src/services/portal/portal-schedule-service.ts)。

## 5. UGC 合规守卫

![UGC 合规守卫决策树](assets/ugc-compliance.svg)

合规守卫只拦截 Discover/Treehole 的非 `meta` GET。写操作和 `meta` 继续进入真实业务；被拦截的读请求仍需 Bearer 鉴权。后台合规模式可返回纯文本生成的 `id=0` mock，可信 ASN 与端口命中时则强制清空 mock，返回空分页、空对象或零值。

守卫必须挂在 app 层而非 Hono 子应用内部，因为 payload 选择依赖完整的 `c.req.path`。[`src/routes/index.ts`](src/routes/index.ts)、[`src/runtime/ugc-compliance-state.ts`](src/runtime/ugc-compliance-state.ts)

## 6. 管理员会话

![管理员 Cookie 会话生命周期](assets/admin-session.svg)

代码当前使用 `ADMIN_USERNAME` / `ADMIN_PASSWORD` 校验并签发 HttpOnly、SameSite=Strict Cookie；服务端只在进程内保存随机令牌。会话有 30 分钟空闲 TTL、8 小时绝对 TTL 和 128 条上限。前端收到管理 API 的 `401` 后清空管理 Query 缓存并回到登录表单。

这带来一个文档未记录的部署事实：蓝绿切换、PM2 重启或请求落到另一实例会丢失管理员会话，即使浏览器 Cookie 还在。它不影响普通 Self JWT 用户，但会要求管理员重新登录。[`src/middleware/admin-session.middleware.ts`](src/middleware/admin-session.middleware.ts)、[`web/src/pages/admin/layout.tsx`](web/src/pages/admin/layout.tsx)

## 7. 状态持久化边界

![应用状态持久化边界](assets/state-boundaries.svg)

| 边界 | 当前内容 | 可靠性含义 |
|---|---|---|
| SQLite | `users`、`credentials`、`cache`；Discover 3 表；Treehole 4 表；Analytics 2 表，共 12 表 | 可跨进程重启；启动时通过兼容 SQL 建表和补列，不是独立 migration 流 |
| 本地文件 | `announcements.json`、`ugc-compliance-state.json`、Discover 图片、Treehole 头像、业务与 PM2 日志 | 单机稳定；多实例需要共享盘或外部存储 |
| 进程内存 | 验证码会话、管理员会话、登录失败限流、静默重认证冷却 | 重启即丢失；多实例间不共享 |

依据：[`src/db/index.ts`](src/db/index.ts)、[`src/db/schema.ts`](src/db/schema.ts)、[`src/services/content/announcement-service.ts`](src/services/content/announcement-service.ts)、[`src/runtime/ugc-compliance-state.ts`](src/runtime/ugc-compliance-state.ts)。

## 8. 代码—文档一致性

| 文档 | 仍与代码一致 | 已确认漂移 |
|---|---|---|
| [`docs/architecture/ARCHITECTURE.md`](docs/architecture/ARCHITECTURE.md) | Bun/Hono 分层、校园凭证恢复、缓存语义、UGC 媒体边界 | 仍写 `/status`、Basic Auth、硬编码管理员口令；数据库仍写 10 表，漏掉 2 张 Analytics 表；测试清单漏掉管理员会话和分析测试 |
| [`docs/architecture/WEB_ARCHITECTURE.md`](docs/architecture/WEB_ARCHITECTURE.md) | React/Query/Zustand 分层、`/m` 托管、业务页守卫 | 管理认证仍写 Basic Auth；管理路由仍是旧的 `/admin/announcements` 等路径，代码已拆成 `/admin/users`、`/admin/content`、`/admin/manage/*`、`/admin/system/*` |
| [`docs/api/API.md`](docs/api/API.md) | 统一 envelope、缓存 `_meta`、课表/UGC/媒体主契约 | 管理接口整章仍写 Basic Auth；不存在的 `/status` 仍在矩阵；缺 `/api/admin/session`、`/api/admin/analytics/overview`；总矩阵缺 classrooms/evaluations；错误码表缺 `3005` 和 `4004` |
| [`docs/api/CLASSROOM_FREE_QUERY_REQUIREMENTS.md`](docs/api/CLASSROOM_FREE_QUERY_REQUIREMENTS.md) | 只读查询、管理员上游账号、无缓存、过滤特殊场地 | “下个会话开发重点”已经全部落地；文档写死具体账号，代码已改为 `CLASSROOM_ADMIN_STUDENT_ID`；应转为已实现决策记录而非待办 |
| [`docs/api/CLASSROOM_FREE_QUERY_FRONTEND.md`](docs/api/CLASSROOM_FREE_QUERY_FRONTEND.md) | 两个接口、参数和无缓存语义与实现一致 | 错误表未列服务账号未配置的 `3005/503` |
| [`docs/api/EVALUATION_API.md`](docs/api/EVALUATION_API.md) | 发现、状态、预检与提交主流程存在 | 独立文档记录了 `4004`，但主 API 文档没有把评教路由和错误码纳入总契约 |
| [`docs/ops/DEPLOY.md`](docs/ops/DEPLOY.md) | Bun、PM2、前端构建、蓝绿与 Git push 发布链仍存在 | Nginx 路由仍要求 `/status`；最小环境配置未包含管理账号；备份清单未显式列 UGC 状态文件；未提示管理会话在切槽后失效 |

## 9. GEB 同构缺口

静态扫描结果：

| 区域 | TS/TSX 文件 | 缺 L3 | 覆盖率 |
|---|---:|---:|---:|
| `src/` | 86 | 16 | 81% |
| `web/src/` | 105 | 60 | 42% |
| `tests/` | 17 | 7 | 58% |
| 合计 | 208 | 83 | 60% |

缺口不是均匀分布：后端主要集中在若干基础工具、Calendar 路由和管理服务；Web 则覆盖请求层、状态、页面、widgets 和 shared UI。现有部分 L3 还是“相邻类型、API 与应用基础设施”这类泛化描述，虽然形式存在，但不能帮助后续 Agent 恢复真实依赖方向。

这与根协议“L3 是代码逻辑的折叠”不完全同构。修复时应按模块批次补齐，并同时核对相邻 `AGENTS.md`，不应一次机械插入 83 个模板头。

## 10. 建议的文档修复顺序

1. 先统一管理认证真相：同步改架构、API、Web、部署四处，删除 `/status` 与 Basic Auth 旧叙述，补 `/api/admin/session` 和内存会话限制。
2. 更新数据库与分析契约：12 表、`analytics_daily_*`、`/api/admin/analytics/overview`、`3005/4004`。
3. 以 [`web/src/app/router/paths.ts`](web/src/app/router/paths.ts) 为唯一清单重写 Web 管理路由章节。
4. 将空教室需求备忘改成“已实现决策 + 仍未实现事项”，删除具体人员信息和过期待办。
5. 补部署状态边界：管理员会话切槽失效、UGC 状态文件备份、完整必需环境变量。
6. 按 `src` → `web/src/entities|app` → `web/src/pages|widgets` → `tests` 的顺序修复 GEB L3；先补架构枢纽，再补叶子组件。

## 证据索引

- [`src/index.ts`](src/index.ts)、[`src/routes/index.ts`](src/routes/index.ts)：进程入口、路由边界、SPA/媒体托管与 UGC 守卫。
- [`src/routes/auth/auth.routes.ts`](src/routes/auth/auth.routes.ts)、[`src/auth/credential-manager.ts`](src/auth/credential-manager.ts)：登录、验证码、学校凭证与交互恢复状态。
- [`src/services/academic/schedule-facade.ts`](src/services/academic/schedule-facade.ts)：JW/Portal 双源优先级与自然周回退约束。
- [`src/middleware/admin-session.middleware.ts`](src/middleware/admin-session.middleware.ts)：当前管理员 Cookie 会话真相。
- [`src/db/schema.ts`](src/db/schema.ts)、[`src/db/index.ts`](src/db/index.ts)：12 表 Schema 与启动时兼容初始化。
- [`web/src/app/router/paths.ts`](web/src/app/router/paths.ts)、[`web/src/app/router/router.tsx`](web/src/app/router/router.tsx)：当前真实前端路由。
- [`src/utils/errors.ts`](src/utils/errors.ts)：`3005`、`4004` 与 HTTP 状态映射。
- [`tests/admin-session.test.ts`](tests/admin-session.test.ts)、[`tests/admin-dashboard-activity.test.ts`](tests/admin-dashboard-activity.test.ts)：新管理会话与分析能力已有测试证据。
