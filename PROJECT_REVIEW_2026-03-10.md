# HUAS 项目整体审查报告

> 审查日期：2026-03-10
> 审查范围：`/Users/xiangyun/Desktop/huas-server` 当前工作区
> 审查方式：代码阅读 + 自动化验证 + 现有文档对照

## 1. 结论摘要

项目当前的工程基础是合格的：

- 后端按 `routes / services / auth / parsers / db / utils` 分层，职责边界清楚。
- 前端按 `app / entities / features / pages / shared / widgets` 分层，模块化程度也够用。
- 自动化检查结果是绿的：
  - `bun test --preload ./tests/setup.ts`：40 个测试全部通过
  - `npm run typecheck`（`web/`）：通过
  - `npm run build`（`web/`）：通过

但从“能长期稳定上线”的角度看，项目仍有几类高优先级问题，主要集中在安全和部署一致性，而不是业务逻辑正确性：

1. 管理员 Basic Auth 凭证被硬编码在源码里，而且还被写进了 `API.md`。
2. `JWT_SECRET` 有可用的默认值；同一个密钥同时用于 JWT 签名和用户密码 AES 加密。
3. 官方部署链路和当前实现不一致：`Dockerfile` 没带前端静态产物与 `public/`，`deploy.sh` 也不会构建前端。
4. 登录链路支持“本地密码直登”，这让服务在首登后部分脱离学校认证体系，属于需要明确接受的安全取舍。
5. 文档已开始和真实代码漂移，尤其是前端路由与页面结构。

结论：

- 从功能完成度看，项目已经可用。
- 从安全与运维可靠性看，不建议在不处理高优先级问题的情况下继续扩大使用面。

## 2. 审查方法与验证结果

### 2.1 我实际执行的检查

后端：

- 阅读 `src/index.ts`、`src/routes/index.ts`
- 阅读认证与凭证链路：`src/routes/auth/auth.routes.ts`、`src/auth/credential-manager.ts`、`src/auth/auth-engine.ts`、`src/core/http-client.ts`
- 阅读 Discover 主链路：`src/routes/discover/discover.routes.ts`、`src/services/discover/discover-service.ts`、`src/services/discover/media-service.ts`
- 阅读缓存与回退：`src/services/infra/cache-service.ts`、`src/services/infra/refresh-fallback.ts`
- 阅读管理端：`src/middleware/admin-basic-auth.middleware.ts`、`src/routes/admin/admin.routes.ts`、`src/services/admin/dashboard-service.ts`
- 阅读数据库定义与初始化：`src/db/schema.ts`、`src/db/index.ts`

前端：

- 阅读路由与鉴权：`web/src/app/router/*`
- 阅读状态与 HTTP 封装：`web/src/app/state/*`、`web/src/shared/api/http-client.ts`
- 阅读 Discover 与我的页面：`web/src/pages/discover/index.tsx`、`web/src/pages/me/index.tsx`、`web/src/pages/me-discover/index.tsx`
- 阅读 Discover 交互：`web/src/features/discover-filter/ui/discover-controls.tsx`、`web/src/widgets/discover-feed/discover-feed.tsx`

部署与文档：

- 阅读 `Dockerfile`、`docker-compose.yml`、`deploy.sh`、`scripts/deploy-huas.sh`、`ecosystem.config.cjs`
- 对照 `ARCHITECTURE.md`、`WEB_ARCHITECTURE.md`、`API.md`、`DEPLOY.md`

### 2.2 自动化验证结果

#### 后端测试

命令：

```bash
bun test --preload ./tests/setup.ts
```

结果：

- 40 pass
- 0 fail

覆盖到的主链路包括：

- 登录成功 / 本地登录 / 验证码登录
- 凭证刷新与静默重认证
- 课表/成绩缓存与回退
- Discover 发帖 / 评分 / 推荐 / 管理员删帖
- 公告公共接口

#### 前端类型检查

命令：

```bash
cd web && npm run typecheck
```

结果：

- 通过

#### 前端构建

命令：

```bash
cd web && npm run build
```

结果：

- 通过
- 当前主 bundle 约 `469.64 kB / gzip 151.16 kB`

说明：

- 这些自动化检查可以说明“当前工作区代码基本可运行”。
- 但它们并不能覆盖部署链路、硬编码凭证、安全边界和文档漂移问题。

## 3. 当前项目结构快照

### 3.1 后端

核心职责划分比较清晰：

- `src/routes/*`：路由与 HTTP 入口
- `src/services/*`：业务编排
- `src/auth/*`：CAS 登录、凭证恢复、JWT
- `src/parsers/*`：学校返回结构解析
- `src/db/*`：SQLite + Drizzle schema 与兼容迁移
- `src/utils/*`：时间、日志、错误、响应、加密工具

后端的优点是主链路完整：

- 登录后会落用户、凭证、加密密码
- 上游凭证失效后能自动刷新
- 刷新失败还有静默重认证
- 缓存层支持 stale fallback
- Discover 与学校业务链路解耦，结构上独立

### 3.2 前端

前端分层也比较健康：

- `app`：路由、Provider、全局状态、样式令牌
- `entities`：领域 API 与 query
- `features`：登录、发帖、评分、筛选
- `pages`：页面级装配
- `shared`：通用组件与 API 基础设施
- `widgets`：中型 UI 组合模块

当前真实路由已经是：

- `/m/login`
- `/m/discover`
- `/m/me`
- `/m/me/discover`

对应证据：

- `web/src/app/router/router.tsx:7-55`
- `web/src/pages/me/index.tsx:23-78`
- `web/src/pages/me-discover/index.tsx:28-89`

### 3.3 部署

现在项目实际上存在三条部署思路：

1. `deploy.sh`：裸机 Bun + PM2
2. `docker-compose.yml`：容器部署
3. `scripts/deploy-huas.sh`：带前端构建的 rsync 部署

这三条链路目前并不完全一致，这是后面“高优先级问题”的来源之一。

## 4. 高优先级问题

### P0. 管理员账号密码硬编码在仓库里，且文档直接公开

证据：

- `src/middleware/admin-basic-auth.middleware.ts:10-12`
- `API.md` 中直接写明管理员用户名和密码

现状：

- `ADMIN_USERNAME = '202412040130'`
- `ADMIN_PASSWORD = 'A18569081662'`

影响：

- 任何拿到仓库代码或 API 文档的人都能直接访问：
  - `/status`
  - `/api/admin/dashboard`
  - `/api/admin/announcements`
  - `/api/admin/discover/posts/:id`
- 这不是“弱口令”问题，而是“凭证已经公开”的问题。

建议：

1. 立即把管理员账号密码迁移到环境变量。
2. 代码层在未配置时直接拒绝启动。
3. 从 `API.md` 中删除真实凭证，只保留认证方式说明。
4. 视为已泄漏凭证，立即轮换，不要复用现有值。

### P0. `JWT_SECRET` 有默认值，而且同时承担两种安全职责

证据：

- 默认值：`src/config.ts:15-18`
- JWT 签名：`src/auth/jwt.ts:22-35`
- AES 密码加解密：`src/utils/crypto.ts:50-76`
- 本地密码登录读取：`src/routes/auth/auth.routes.ts:68-70`

问题拆解：

1. `process.env.JWT_SECRET` 缺失时，服务仍会用固定字符串启动。
2. 同一个密钥同时用于：
   - JWT 签名
   - 数据库里用户密码的 AES-GCM 加密

影响：

- 如果生产环境漏配 `JWT_SECRET`，攻击者可直接伪造任意用户 JWT。
- 一旦该密钥泄漏，不仅 JWT 可伪造，数据库中保存的用户密码也可被解密。
- 这把“认证密钥”和“敏感数据加密密钥”耦合到了一起，破坏半径过大。

建议：

1. 移除默认值，未配置时直接 `throw` 并拒绝启动。
2. 分拆为两个独立密钥：
   - `JWT_SIGNING_SECRET`
   - `PASSWORD_ENCRYPTION_SECRET`
3. 对现有密文做一次迁移或重新写入计划。

### P1. 两条官方部署路径和当前前端托管方式不一致

证据：

- 前端运行依赖 `web/dist`：`src/index.ts:16-45`
- 状态页依赖 `public/status.html`：`src/index.ts:82-86`
- `Dockerfile` 没复制 `web/`、`web/dist/`、`public/`：`Dockerfile:1-21`
- `deploy.sh` 不构建前端：`deploy.sh:33-48`
- 只有 `scripts/deploy-huas.sh` 明确会构建前端：`scripts/deploy-huas.sh:55-87`

影响：

- 按当前 `Dockerfile` 构建出的镜像，`/m` 前端和 `/status` 页面都缺资源。
- 按当前 `deploy.sh` 裸机部署，如果机器上没有提前手工构建 `web/dist`，前端入口同样不可用。
- 这类问题不会出现在单元测试里，但会在第一次真实部署时直接暴露。

建议：

1. 明确“官方标准部署链路”只保留一条，不要三套脚本各自维护。
2. 如果保留 Docker：
   - 构建阶段加入 `web` 依赖安装与前端构建
   - 把 `web/dist` 与 `public/` 复制进镜像
3. 如果保留 `deploy.sh`：
   - 在脚本内增加 `web` 构建步骤
   - 部署失败时要对 `web/dist/index.html` 做存在性校验

### P1. 登录支持本地密码直登，服务会部分脱离学校认证体系

证据：

- 本地密码命中时直接签发 JWT：`src/routes/auth/auth.routes.ts:56-88`
- 密码长期保存为可逆密文：`src/db/schema.ts:1-8`、`src/utils/crypto.ts:46-76`

现状：

- 用户首次成功走 CAS 后，服务会保存其 AES 加密后的密码。
- 后续再次登录时，如果输入密码与本地保存一致，可绕过 CAS，直接登录成功。

这不是实现 bug，而是需要明确接受的安全策略。

风险：

- 用户学校密码修改后，只要还记得旧密码，依然可能登录本服务。
- 学校账号被停用后，Discover 这类本地业务仍可能继续访问，直到需要学校侧凭证时才暴露问题。
- 服务从“学校认证代理”变成了“带本地凭证回放能力的次级认证中心”。

建议：

1. 产品上先做决定：本地密码直登是否是明确需要的能力。
2. 如果不是，关闭该分支，所有登录统一回 CAS。
3. 如果保留，至少要增加：
   - 本地登录有效期
   - 定期强制走一次 CAS 校验
   - 学校侧凭证恢复失败后的强制重新认证策略

### P2. 全局 CORS 默认全开，没有做来源约束

证据：

- `src/index.ts:54-56`

现状：

- `app.use('*', cors())` 使用默认配置。
- 当前代码没有对管理端、业务端、生产前端域名做来源白名单。

影响：

- 对现在的移动 Web 来说，这不一定立刻形成可利用漏洞，但它扩大了 API 被第三方页面调用和读取响应的边界。
- 当后续增加更多管理员能力、调试接口或 Cookie/Session 形态变更时，风险会放大。

建议：

1. 按环境区分允许来源：
   - 本地开发
   - 生产前端域名
2. 对管理接口额外限制来源，或直接不开放跨域。

### P2. 现有前端文档已经和真实实现漂移

证据：

- `WEB_ARCHITECTURE.md:28-29` 仍写“Discover 右下角悬浮发帖按钮”“我的页承载资料与我的发布”
- `WEB_ARCHITECTURE.md:136-140` 仍只列 `/m/login`、`/m/discover`、`/m/me`
- 实际代码已有 `/m/me/discover`：`web/src/app/router/router.tsx:42-47`
- 实际“我的”页已改成入口页：`web/src/pages/me/index.tsx:33-77`
- 实际发帖入口已进入顶部控件区：`web/src/features/discover-filter/ui/discover-controls.tsx:42-65`

影响：

- 新维护者会按照旧文档理解 UI 与路由，导致讨论、排查和继续开发时产生偏差。
- 文档基线和代码基线不一致，会削弱现有架构文档的可信度。

建议：

1. 更新 `WEB_ARCHITECTURE.md`，把当前真实路由与页面职责写清楚。
2. 对新页面 `me-discover`、新组件 `PageHero`、新 Discover 控件布局做增量说明。

## 5. 中优先级观察项

### 5.1 公告存储是文件写入队列，只适合单实例

证据：

- `src/services/content/announcement-service.ts`
- 写锁是进程内 `writeQueue`，不是跨实例锁
- PM2 当前是 `instances: 1`：`ecosystem.config.cjs`

结论：

- 在当前单实例 PM2 模式下可接受。
- 如果未来扩成多实例或多容器副本，公告写入存在并发覆盖风险。

### 5.2 测试覆盖很好，但偏向业务与回归，不覆盖部署与安全基线

现状：

- 测试覆盖登录、缓存、Discover、管理员删帖等行为，这部分做得不错。
- 但没有自动化校验：
  - Docker 镜像里是否包含 `web/dist`
  - `public/status.html` 是否可用
  - 是否存在默认密钥 / 硬编码管理员凭证

建议：

- 增加 2 类轻量检查：
  - 启动前配置断言
  - 部署产物完整性检查

## 6. 项目优点

这部分值得保留，不建议在后续重构时破坏：

### 6.1 分层清晰

后端和前端都已经形成比较稳定的分层，不是“所有逻辑塞在入口文件”的状态。后续继续扩功能时，具备继续维护的基础。

### 6.2 测试用例质量高于一般个人项目

尤其是后端：

- 验证码二段登录
- 凭证恢复
- stale fallback
- Discover 推荐与管理员删帖
- 课表/成绩缓存放大回归

这些都不是样板测试，是真实保护核心链路的测试。

### 6.3 Discover 模块已经形成相对完整闭环

从：

- 发帖
- 图片压缩与存储
- 列表
- 详情
- 评分
- 删除
- 推荐
- 我的发布

到前端完整体验，已经不是半成品状态。

### 6.4 时区模型统一

`Asia/Shanghai` 被统一固化到配置、时间工具、文档和返回结构中，这对课表/成绩/公告类项目非常重要。

## 7. 建议的整改顺序

### 24 小时内

1. 去掉硬编码管理员凭证，改用环境变量，并轮换当前值。
2. 去掉 `JWT_SECRET` 默认值，未配置时直接拒绝启动。
3. 拆分 JWT 签名密钥和密码加密密钥。
4. 统一部署链路，至少先修好 `Dockerfile` 和 `deploy.sh`。

### 1 周内

1. 明确“本地密码直登”是否保留。
2. 收紧 CORS 白名单。
3. 更新 `WEB_ARCHITECTURE.md` 与 `API.md`，删除过时内容和敏感信息。
4. 增加部署产物完整性检查。

### 后续迭代

1. 如果有多实例计划，把验证码会话与公告写锁迁移到 Redis/数据库。
2. 为前端增加真实浏览器联调回归。
3. 把前端 bundle 体积纳入持续观察项。

## 8. 我对当前项目状态的判断

如果按 10 分制给一个“工程成熟度”分数：

- 功能完成度：`8/10`
- 代码结构：`8/10`
- 测试基础：`8/10`
- 安全基线：`4/10`
- 部署一致性：`5/10`
- 文档一致性：`6/10`

综合判断：

- 这是一个“核心功能已经做出来，而且代码组织不错”的项目。
- 现在最需要的不是再堆新功能，而是先补上安全基线和部署一致性。

## 9. 附录：本次审查中确认通过的命令

```bash
# 后端
bun test --preload ./tests/setup.ts

# 前端
cd web && npm run typecheck
cd web && npm run build
```

结果：

- 后端测试：40/40 通过
- 前端类型检查：通过
- 前端构建：通过

---

如果要继续推进，最值得优先做的不是 UI 微调，而是先修掉下面三项：

1. 管理员凭证硬编码
2. JWT / 加密密钥设计
3. 部署链路和前端产物不一致
