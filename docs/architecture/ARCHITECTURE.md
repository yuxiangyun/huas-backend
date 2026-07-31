# HUAS Server 后端架构与维护地图

> 事实基线：2026-07-31
>
> 本文只描述后端机器相。Web 结构由 `WEB_ARCHITECTURE.md` 单独维护，接口字段由 `docs/api/` 维护，发布操作由 `docs/ops/DEPLOY.md` 维护。

## 1. 系统定位

HUAS Server 是一个 Bun 模块化单体，同时承载：

- 校园身份登录、学校凭证恢复与本服务 JWT；
- 课表、成绩、一卡通、评教、空教室和日历订阅；
- Community 公共资料、Discover、Treehole、Notifications 与 Messaging；
- 独立 Cookie 认证的 Operations 管理面；
- `/m` 静态应用、公共媒体、健康检查与 Prometheus 指标。

技术栈为 Bun、TypeScript、Hono、Drizzle ORM、SQLite、Sharp 与 Winston。SQLite 是业务事实源；本地文件只保存公告、媒体、日志与可重建的运行策略。

## 2. 运行时入口与依赖方向

```text
src/index.ts
  ├─ assertConfiguredDatabaseSchemaCurrent() 只读校验
  ├─ createApplicationComposition()
  │    ├─ Community ── Identity reader
  │    ├─ Notifications
  │    ├─ Discover ─── Community reader + Notifications ports
  │    ├─ Treehole ─── Community reader + Notifications ports
  │    ├─ Messaging ── Community reader
  │    └─ Operations ─ Identity/Discover/Treehole/Messaging public ports
  ├─ createApp(dependencies)
  ├─ PeriodicTaskRegistry.start()
  └─ Bun.serve()
```

三个顶层文件各只有一个变化理由：

| 文件 | 职责 | 禁止事项 |
|---|---|---|
| `src/index.ts` | schema 校验、监听、信号、周期任务和优雅关闭 | 不构造业务模块，不迁移数据库 |
| `src/composition.ts` | 唯一跨模块组合根，连接构造器和公开 ports | 不承载业务规则，不被领域模块反向导入 |
| `src/app.ts` | 构造可测试 Hono 应用，挂载中间件、路由、静态资源和公共媒体 | 不打开端口，不持有数据库 singleton |

社交模块只导出构造器、route factory 与 ports。Discover、Treehole、Messaging、Notifications 不得导入具体 Community adapter，也不得直接 JOIN `users` 或 `community_profiles`。

## 3. HTTP 与认证边界

| 路径 | 认证 | 责任域 |
|---|---|---|
| `/auth/login` | 无 | Identity/Campus 登录并签发本服务 JWT |
| `/health`、`/health/live`、`/health/ready` | 无 | 本地进程、SQLite 与 schema readiness |
| `/metrics` | 无 | 进程内低基数 Prometheus 指标 |
| `/api/public/*` | 无 | 公告等公共读取 |
| `/api/admin/session` | 登录凭据或后台 Cookie | Operations 独立管理会话 |
| `/api/admin/*` | HttpOnly Cookie | 管理查询与受控内容命令 |
| `/api/community/*` | Bearer JWT | 当前资料和公共用户详情 |
| `/api/discover/*` | Bearer JWT | 好饭内容、点赞、评论与推荐 |
| `/api/treehole/*` | Bearer JWT | 脱匿名树洞内容、点赞与评论 |
| `/api/notifications/*` | Bearer JWT | 活动通知列表、未读与逐条已读 |
| `/api/messaging/*` | Bearer JWT | 一对一私信、游标、未读与私有媒体 |
| `/media/discover/*` | 无 | 未删除 Discover 帖子媒体 |
| `/media/treehole-avatar/*` | 无 | Community 当前头像媒体；URL 名称仅是历史路径 |

普通用户 JWT 与后台 Cookie 完全独立。私信图片不进入公共 `/media/*`，参与者和管理员分别通过 Messaging/Operations 鉴权路由读取。

## 4. 校园业务纵向切片

### 4.1 Identity 与 Campus Integrations

Identity 拥有校园身份、登录与本服务凭证边界。Campus Integrations 封装 CAS、Portal、JW、凭证恢复、学校 HTTP 和解析器；业务模块只消费其公开能力。

客户端只持本服务 JWT。学校子凭证保存在 SQLite `credentials`；恢复链按“现有子凭证 → TGC 交换 → 加密密码静默 CAS”收敛。明确需要验证码时写入 `interactive_login_required` 标记；最终无法恢复统一返回 `3003`。

### 4.2 Academic、Calendar 与 Cache

Academic 承载课表、成绩、评教和空教室用例。`/api/schedule` 在一次请求内固定读取课表来源策略：依次尝试两源 current，均失败后才按 JW、Portal 固定顺序选择 stale。成绩强刷执行 JW fresh-first，只有新鲜路径穷尽后才允许 stale fallback。

Calendar 负责订阅签名、周快照与 ICS 输出。Cache 拥有版本 envelope、TTL、容量限制和同意图 singleflight；`TTL=0` 表示永久缓存，不等于立即过期。

## 5. 社交领域边界

社交能力保持五个独立纵向切片，不建立巨型 `social` 模块。

### 5.1 Community

Community 独立拥有 `community_profiles` 的昵称和头像元数据，通过 Identity 的只读端口取得 `id/className`。公开资料固定为：

```ts
type CommunityProfile = {
  id: number;
  displayName: string;
  avatarUrl: string | null;
};
```

昵称允许重复；空昵称先取 `className` 第一个数字之前的前缀，生成 `{前缀}同学{id}`，没有有效前缀时回退 `文理er {id}`。当前用户 `/api/community/profile` 在公共三字段之外额外返回可空 `nickname` 供编辑回填；公共详情和所有社交作者投影始终只有三字段。非空昵称由领域层按 2–12 Unicode code point、无控制字符/换行、非保留名校验，缺省 displayName 不写回 nickname。公共接口不暴露学号、真实姓名、完整班级、评论历史或点赞历史，也不提供用户搜索。

头像由 Community 自有 adapter 管理。新文件使用不可变 UUID 名称，SQLite 更新失败时补偿删除；公开读取会验证路径仍绑定当前资料。

### 5.2 Discover

Discover 只拥有帖子、图片元数据、点赞和评论事实。所有帖子与评论响应统一携带 Community `author`。

- 点赞/取消点赞幂等，作者不能点赞自己的帖子；
- `latest` 按发布时间倒序；
- `popular` 先按 `likeCount`，再按发布时间和 ID；
- `recommended` 从当前用户点赞过的分类和标签推断偏好，无有效数据时回退 `latest`；
- 推荐和列表先查询 Discover 自有事实，再批量调用 `CommunityProfileReader.getMany()`；
- 删除为领域软删除，旧 Activity Notification 可保留并在点击时得到内容不存在。

Discover 不再存在评分表、评分字段、评分路由或兼容 DTO。

### 5.3 Treehole

“树洞”只保留产品名称，不再匿名。帖子和评论都绑定 `users.id` 并返回统一 `author`。资料、头像和活动通知已从 Treehole 模块移出；Treehole 只拥有帖子、点赞与评论事实。

公共用户内容通过独立用户帖子接口读取；用户主页由调用方分别组合 Community detail、Discover user posts 和 Treehole user posts，后端不建立跨领域超级聚合。

### 5.4 Notifications 与 Transactional Outbox

活动通知只有六类：

| type | resourceType | 触发事实 |
|---|---|---|
| `discover_like` | `discover_post` | Discover 有效点赞 |
| `discover_comment` | `discover_post` | Discover 普通评论 |
| `discover_comment_reply` | `discover_post` | Discover 回复 |
| `treehole_like` | `treehole_post` | Treehole 有效点赞 |
| `treehole_comment` | `treehole_post` | Treehole 普通评论 |
| `treehole_comment_reply` | `treehole_post` | Treehole 回复 |

Discover/Treehole 在自己的 SQLite 短事务中同时写互动事实、派生计数和 `activity_outbox`。提交后立即 best-effort 投影；失败不会把已经提交的互动伪装成失败，而由周期任务按退避时间重试。

`event_id` 包含互动类型、资源、子资源、actor 和 recipient，保证逐接收者幂等。自我互动不生成事件；回复同时面向父评论作者和不同的帖子作者，并自动去重。取消点赞在原互动事务内删除对应 Outbox/Notification，使再次点赞可以重新投影。

Notifications 不保存正文，不与内容表建立跨领域外键，也不承载私信未读。只支持逐条已读，第一版永久保留且没有清理/归档任务。普通列表的 offset 只服务人工翻页，轮询通过通知 ID 高水位增量入口避免并发插入造成重复或漏项。

### 5.5 Messaging

Messaging 是一对一专用结构，不为群聊预留 participants：

- 有序用户对 `user_low_id < user_high_id` 且唯一；
- 禁止给自己发送；
- 会话只在第一条消息成功事务内延迟创建；
- `UNIQUE(sender_user_id, client_message_id)` 保证 UUID 幂等；
- 从用户入口只定位 CommunityProfile 与已有 conversationId，不创建空会话；
- 会话变化轮询使用全局单调 `last_message_id` 高水位，普通 offset 只用于人工翻页；
- 消息无游标取最新页，before 向旧、after 向新增，用户面与管理面共享同一 hasMore 方向语义；
- 每用户按 `messages` 事实复验 30 条/分钟，不依赖进程内计数；
- 服务端游标只单调前进，未读数由消息事实与当前用户游标实时计算；
- 私信不写入活动通知，也不公开已读回执。

消息文字最多 1000 Unicode code point；每条最多 9 张图，单张原图最多 32MB，合计最多 64MB，且至少有文字或图片。HTTP adapter 在 formData 前以 Content-Length 和流式 body-limit 统一执行 413 请求上限；图片转换前按持久发送事实预限流。图片在 SQLite 事务外识别真实格式、自动旋转、缩放至最长边 1280 并以质量 78 转为 WebP；短事务只写会话、消息、图片元数据和 `last_message_id`。任一步失败都会回滚数据库并补偿候选媒体。

Operations 只通过 `MessagingOperationsQueryPort` 读取全部会话、正文、历史和媒体，不接触 Messaging 表或磁盘路径，不暴露修改/删除命令。

## 6. SQLite 事实与迁移

`src/db/schema.ts` 当前声明 17 张业务表：

| 所有者 | 表 |
|---|---|
| Identity/Cache | `users`、`credentials`、`cache` |
| Community | `community_profiles` |
| Discover | `discover_posts`、`discover_post_likes`、`discover_comments` |
| Treehole | `treehole_posts`、`treehole_post_likes`、`treehole_comments` |
| Notifications | `activity_outbox`、`notifications` |
| Messaging | `conversations`、`messages`、`message_images` |
| Operations Analytics | `analytics_daily_metrics`、`analytics_daily_users` |

`schema.ts` 是 Drizzle 类型相，`src/db/migrations/` 是结构演进事实源。`0001/0002` 不可变；`0003_social_rearchitecture` 是破坏性 contract migration：

- 动态保存并验证用户、凭证、缓存、Discover 与 Treehole 核心表行数；
- 将旧用户昵称/头像迁入 `community_profiles` 后从 `users` 删除旧列；
- 按产品决策直接删除旧评分表/字段与旧 Treehole 通知表，即使其中已有数据也不阻断且不转换成新事实；
- 建立 Discover 点赞、Outbox、Notifications 和 Messaging 最终结构；
- 任一断言或 DDL/DML 失败时，整个版本事务回滚且不写版本记录。

应用启动没有 migration 权限。`src/index.ts` 在监听前只读校验版本序列、name/checksum 与最终 schema fingerprint；文件缺失、版本落后、元数据改写或结构漂移都会 fail closed。结构变更只能在部署停流、停 writer 和快照之后显式执行：

```bash
bun run db:migrate -- --db <sqlite-path> --allow-destructive
```

## 7. 文件与媒体边界

默认持久路径均相对 `dirname(DB_PATH)` 或显式配置：

| 数据 | 默认路径 | 访问边界 |
|---|---|---|
| SQLite | `data/huas.db` | 业务事实源 |
| Discover 媒体 | `data/discover/` | 公共路径，读取时验证帖子仍存在 |
| Community 头像 | `data/treehole-avatars/` | 公共路径，读取时验证当前资料绑定；目录名为历史兼容 |
| Messaging 媒体 | `data/message-media/` | 仅参与者 Bearer 或管理员 Cookie 路由 |
| 公告 | `data/announcements.json` | Operations 自有文件 adapter |
| 课表策略 | `data/schedule-source-policy.json` | 原子替换的运行策略 |

私信数据库只保存媒体元数据和 `storage_key`。无主目录清理只处理超过 grace period 且数据库无引用的候选目录，不能删除新鲜上传或已引用文件。

## 8. 周期任务、日志与关闭

`PeriodicTaskRegistry` 统一注册：

- credential、cache 与 captcha session 清理；
- Activity Outbox 投影重试；
- 无主私信媒体清理。

每个任务具名、可停止、错误隔离且同任务不重叠。优雅关闭顺序为：停止周期任务 → 停止 HTTP server → flush shutdown hooks → dispose composition → 关闭 SQLite。

Notifications/Messaging 的成功只读轮询采用 quiet access log；4xx/5xx、写操作和 HTTP metrics 始终保留。管理员私信会话列表、增量、消息和媒体读取分别写最小审计，只记录管理员、操作类型、必要 conversationId/稳定媒体键；所有日志禁止记录私信正文、原始文件名、二进制或身份隐私内容。

## 9. Operations 边界

Operations 聚合管理会话、Dashboard、Analytics、公告、日志、课表来源策略和社交管理入口。跨领域数据必须来自公开 ports：

- Identity 提供用户/凭证/缓存统计；
- Discover 提供点赞口径的帖子快照和删除命令；
- Treehole 提供帖子/评论只读查询与受控删除命令；
- Messaging 只提供会话、消息和媒体只读查询。

Operations 不得直接 SQL 查询其他模块事实表。管理员虽然可以读取全部私信，但不能修改或删除消息、图片或会话。

## 10. 质量门禁与演进规则

后端完整门禁：

```bash
bun run typecheck
bun run test
bun run db:verify
git diff --check
```

高风险变更还必须运行相应定向套件。数据库迁移测试必须只使用内存或临时数据库，禁止对真实 `data/huas.db` 演练破坏性版本。

新增或修改能力时遵循：

1. 先确定领域所有者和最窄 port，不建立跨领域 JOIN 或 concrete singleton 依赖；
2. 业务规则放 domain/application，HTTP 只解析协议，SQLite/file adapter 只实现基础设施；
3. 互动事实与 Outbox、消息事实与媒体元数据等强一致边界必须在同一短事务；
4. Sharp、文件系统、学校上游和 Community 投影不得进入 SQLite 写事务；
5. 新表同时更新 migration、schema、测试和运维手册；
6. 修改业务文件后依次核对 L3、模块 L2 与根 L1，保持 GEB 文档和代码同构。
