# HUAS Server Operations API 契约

> Base URL：`http://localhost:3000`
> 通用响应包、错误码与时间格式见 [API.md](./API.md)；社交用户 DTO 见 [SOCIAL_API.md](./SOCIAL_API.md)

本文描述公共公告、首页弹窗及账户查询、内容管理、早起运营、配置和运行观测的 `/api/admin/*` 合同。管理端使用独立 HttpOnly Cookie，会话与普通用户 Bearer JWT 不互通。

## 1. 后台会话

后台账号来自 `ADMIN_USERNAME` / `ADMIN_PASSWORD`。未配置任一值时不能建立会话。

### 1.1 `POST /api/admin/session`

无需已有 Cookie。请求：

```json
{ "username": "admin", "password": "..." }
```

成功返回：

```json
{
  "success": true,
  "data": { "username": "admin", "expiresInSeconds": null }
}
```

同时设置 `huas_admin_session` Cookie：

- `HttpOnly`
- `SameSite=Strict`
- `Path=/api/admin`
- HTTPS 或 `X-Forwarded-Proto: https` 时设置 `Secure`
- 不设置 `Max-Age` / `Expires`，服务端不会因时间自动使会话失效

凭据错误返回 `401 + 4001`，不会设置 Cookie。

### 1.2 `GET /api/admin/session`

探测当前会话，返回 `{ username, expiresInSeconds: null }`。会话失效返回 HTTP 401。

### 1.3 `DELETE /api/admin/session`

撤销服务端 token 并删除 Cookie，返回 `{ revoked: true }`。

### 1.4 生命周期

- 服务端只在进程内保存随机 token 与会话元数据，不在 Cookie 中保存账号密码。
- 无空闲或绝对 TTL；会话只有主动退出、进程重启/切槽，或新登录触发 128 条容量淘汰时失效。请求会更新最后访问时间，仅用于容量淘汰。
- 会话是进程内状态；重启或切槽后浏览器 Cookie 仍可能存在，但服务端会要求重新登录。
- 除 `POST /session` 外，全部 `/api/admin/*` 先经过同一会话中间件。

## 2. 账户与概览

### 2.1 `GET /api/admin/users`

| 参数 | 规则 |
|---|---|
| `page` | 正安全整数，默认 1，每页固定 20；超出结果末页时返回末页 |
| `search` | 学号或姓名按关键词字面包含搜索，`%`、`_` 和反斜杠不作为通配语法 |
| `className` | 完整班级精确匹配；未分配值为 `__UNASSIGNED__` |
| `grade` | 可省略；传入时必须为 `19xx` 或 `20xx` 四位年级 |

```ts
interface AdminUsers {
  items: Array<{
    studentId: string;
    name: string;
    className: string;
    grade: string;
    createdAt: string | null;
    lastLoginAt: string | null;
    lastActiveAt: string | null;
  }>;
  page: number;
  pageSize: 20;
  total: number;
  totalPages: number;
  options: { classes: Array<{ value: string; label: string }>; grades: string[] };
  filters: { search: string; className: string; grade: string };
}
```

列表按 `lastLoginAt DESC, id DESC` 排序；空结果仍返回 `page: 1, totalPages: 1`。筛选选项来自全量账户，不受当前筛选影响。班级缺失展示为“未分配”；年级按学号中第 1 至第 4 个起始位置依次寻找首个 `19xx/20xx`，未匹配时为空字符串，展示、筛选与分布共用同一规则。分页先校验实际 offset 为安全整数，过大页码返回 `400 + 4002`。

账户视图只读取本地学校身份，不合并 Community 昵称、头像或 Bio。管理 API 不提供代登录、密码重置、封禁、删除账户或读取个人课表、成绩、校园卡等学校业务数据的能力。

### 2.2 `GET /api/admin/overview`

无需查询参数，返回：

```ts
interface AdminOverview {
  service: { status: 'ok' | 'error'; timestamp: string };
  metrics: {
    totalUsers: number;
    todayActiveUsers: number;
    activeUsers7d: number;
    newUsers7d: number;
    cacheEntries: number;
    credentialEntries: number;
    totalDiscoverPosts: number;
    totalDiscoverLikes: number;
    memory: { rssMb: number; heapUsedMb: number; heapTotalMb: number };
    uptimeSeconds: number;
  };
  distributions: {
    byClass: Array<{ className: string; count: number }>;
    byGrade: Array<{ grade: string; count: number }>;
  };
}
```

Operations 并行调用 Identity 概览、Discover 统计公开端口，再读取本进程系统快照。概览不加载用户列表、Discover 帖子列表、公告或日志；分布为全量账户分布，年级分布排除未解析年级的账户。

统计口径：

- `totalUsers` 为本地账户数；`todayActiveUsers` 按北京时间当天起点筛选 `lastActiveAt`，`activeUsers7d/newUsers7d` 分别按最近滚动 `7 × 24` 小时筛选 `lastActiveAt/createdAt`。
- Bearer 触达通常每 15 分钟更新一次 `lastActiveAt`，跨北京日期立即更新；本地登录、学校认证及静默恢复成功也可能更新登录与活跃时间。该口径表示账户最近触达，不能解释为人工登录次数、在线会话数或精确操作人数。
- `cacheEntries` 为兼容业务缓存表的行数；`credentialEntries` 只计 `cas_tgc/portal_jwt/jw_session` 三类记录，不校验是否过期，不含 mobile 会话，不能表示可用学校会话数。
- Discover 统计只计未删除帖子及其有效点赞。`service.status` 仅表示本地 SQLite `SELECT 1` 是否成功，不表示学校上游可用；内存与 uptime 属于当前进程。

### 2.3 `GET /api/admin/dashboard`（兼容聚合）

查询参数：

| 参数 | 规则 |
|---|---|
| `page` | 用户分页，默认 1，每页固定 20 |
| `search` | 学号或姓名按关键词字面包含搜索，`%`、`_` 和反斜杠不作为通配语法 |
| `major` | 班级筛选；未分配值为 `__UNASSIGNED__` |
| `grade` | 从学号中解析出的四位年级 |

响应由 Operations 通过 Identity、Discover 公开 query port 及自身基础设施并行聚合：

```ts
interface DashboardResponse extends Omit<AdminOverview, 'distributions'> {
  distributions: {
    byMajor: Array<{ className: string; count: number }>;
    byGrade: Array<{ grade: string; count: number }>;
  };
  users: Omit<AdminUsers, 'filters' | 'options'> & {
    filters: { search: string; major: string; grade: string };
    options: { majors: Array<{ value: string; label: string }>; grades: string[] };
  };
  discover: DiscoverOperationsSnapshot;
  logs: TerminalLogResponse;
  announcements: Announcement[];
}
```

`users.items[]` 与独立账户视图字段相同，含 `lastActiveAt`；列表、时间统计和年级解析沿用上述口径。兼容参数 `major`、`users.filters.major`、`users.options.majors` 及 `distributions.byMajor` 实际表达班级。搜索、班级和年级只过滤 `users`，不影响其他聚合。`discover` 是固定最近 20 篇摘要，只使用 Discover 自有事实和 Community 公共作者投影：

```ts
interface DiscoverOperationsSnapshot {
  totalPosts: number;
  totalLikes: number;
  items: Array<{
    id: number;
    title: string;
    category: string;
    coverUrl: string;
    images: Array<{ url: string; width: number; height: number; sizeBytes: number; mimeType: string }>;
    imageCount: number;
    likeCount: number;
    authorDisplayName: string;
    publishedAt: string | null;
  }>;
}
```

Dashboard 不直接 JOIN Discover/Community 表，Discover 管理统计口径为未删除帖子与其有效点赞。

## 3. Analytics

### 3.1 `GET /api/admin/analytics/overview`

查询参数 `days` 只允许 `7 | 30 | 90`，默认 30；其他值返回 `400 + 4002`。

```ts
interface AnalyticsOverview {
  days: 7 | 30 | 90;
  since: string;
  series: Array<{
    day: string;
    [metricAndPlatform: string]: string | number;
  }>;
}
```

动态键示例：

- `active.web`、`active.miniprogram`、`active.unknown`
- `request.total.<platform>`
- `request.client_error.<platform>`、`request.server_error.<platform>`
- `login.success.<platform>`、`login.failure.<platform>`
- `feature.schedule.<platform>`、`feature.discover.<platform>`、`feature.treehole.<platform>` 等

读取 overview 前会先 flush 当前进程批次。分析记录按北京日期、平台与指标聚合，不保存请求正文、消息正文或图片内容。日期序列覆盖所选天数；当日没有记录的动态键可能省略，读取时按 0 处理。

平台固定为 `web/miniprogram/unknown`，来自平台头或已知校园能力路径的默认归属；没有足够归属信息时归入 `unknown`。`active.<platform>` 在同一北京日期、同一渠道内按账户去重，同一账户跨渠道仍分别计数，渠道相加不能作为全站去重人数。`request.*`、`login.*` 与 `feature.*` 都是次数；功能次数统计相应路由请求，包含失败请求，不能解释为成功使用人数。

## 4. 课表来源策略

### 4.1 `GET /api/admin/academic/schedule-source-policy`

返回当前有效快照：

```json
{
  "mode": "portal-first",
  "updatedAt": "2026-07-28T16:00:00.000+08:00",
  "updatedBy": "admin"
}
```

### 4.2 `PUT /api/admin/academic/schedule-source-policy`

请求 `{ "mode": "jw-first" }`。`mode` 只允许 `mobile-jw-first | jw-first | portal-first`。

| 模式 | current 来源顺序 | stale 来源顺序 |
|---|---|---|
| `mobile-jw-first` | mobile-jw → JW → Portal | mobile-jw → JW → Portal |
| `jw-first` | JW → Portal | JW → Portal |
| `portal-first` | Portal → JW | JW → Portal |

current 是正常读取路径，可能命中永久业务缓存，不保证重新访问学校。用户首选仅前置本次 current，不扩大 stale 的参与范围；在途请求继续使用开始时取得的策略快照。

- 只影响后续 `/api/schedule` 的来源顺序，不清缓存、不主动访问校园上游。
- 同目录临时文件加原子 rename；rename 前失败保留旧有效快照，rename 成功即发布新快照。之后锁清理失败只记录并在下次获取时重试自身 owner，接口仍返回已发布结果；无 owner 的遗留空目录沿用 30 秒回收规则。
- 同进程读取按开始顺序保护最近成功快照，较旧读取不能覆盖较新成功读取或 rename 发布的状态。写入失败不推进成功水位；文件随后缺失或读取失败仍沿用最后有效快照，告警去重也不被旧读取覆盖。
- 首次没有有效文件时回落 `SCHEDULE_SOURCE_MODE`，再回落 `mobile-jw-first`；已有持久化配置不会被升级覆盖，启用新顺序需在 Admin 切换。

## 5. 公告

### 5.1 类型

```ts
type AnnouncementType = 'info' | 'warning' | 'error';

interface Announcement {
  id: string;
  title: string;
  content: string;
  date: string;
  type: AnnouncementType;
  createdAt: string;
  updatedAt: string;
}
```

### 5.2 公共读取

`GET /api/public/announcements` 无需认证，返回按日期与更新时间倒序的精简数组；每项只有 `id/title/content/date/type`。

### 5.3 管理接口

| 接口 | 语义 |
|---|---|
| `GET /api/admin/announcements` | 返回完整 `Announcement[]` |
| `POST /api/admin/announcements` | 创建公告 |
| `PUT /api/admin/announcements/:id` | 部分更新 |
| `DELETE /api/admin/announcements/:id` | 删除，返回 `{ id }` |

创建请求：

```json
{
  "title": "系统公告",
  "content": "公告内容",
  "date": "2026-07-31",
  "type": "info"
}
```

- `title/content/type` 必填且 trim 后非空。
- `date` 可省略，默认北京时间当天；传入时必须为 `YYYY-MM-DD`。
- `date` 必须是真实日期，只控制展示与排序；保存后立即出现在公共列表，不表示预约发布时间，也没有草稿或上下架状态。
- ID 由服务端生成，格式 `YYYYMMDD-N`。
- 更新未传字段保持原值；目标不存在返回 `404 + 4002`。
- 数据位于 `data/announcements.json`，写入经进程内队列串行化并使用同目录临时文件原子替换。

## 6. 终端日志

### 6.1 `GET /api/admin/logs`

| 参数 | 规则 |
|---|---|
| `limit` | 默认 50，最大 200，必须是正整数 |
| `keyword` | 可选，不区分大小写过滤 |

```ts
interface TerminalLogResponse {
  limit: number;
  keyword: string;
  items: Array<{ source: 'out' | 'error'; line: string }>;
}
```

来源固定为 `logs/pm2-out.log` 与 `logs/pm2-error.log`。没有关键词时每文件扫描最后 `limit` 行；关键词搜索每文件最多扫描 800 行。合并后按解析出的时间升序排序并截取最后 `limit` 项。文件不存在或读取失败时降级为空列表；服务只执行有界尾部扫描，不返回任意文件，也不提供完整历史审计查询。

## 7. Discover/Treehole 管理

### 7.1 Discover

| 接口 | 语义 |
|---|---|
| `GET /api/admin/discover/posts?page=&pageSize=&keyword=&category=` | 未删除帖子；默认 20、最大 50；按发布时间、ID 倒序 |
| `GET /api/admin/discover/posts/:id` | 按 ID 读取完整帖子，不依赖当前列表页或筛选 |
| `GET /api/admin/discover/posts/:id/comments?page=&pageSize=` | 指定未删除帖子的评论；默认 50、最大 100；按创建时间、ID 倒序 |
| `DELETE /api/admin/discover/posts/:id` | 软删除帖子，返回 `{ id }` |
| `DELETE /api/admin/discover/comments/:id` | 软删除单条评论，返回 `{ id, postId }` |

`keyword` 字面匹配标题、正文或店名，不匹配作者；`category` 可省略，非空时只允许 `1食堂/2食堂/3食堂/5食堂/校外/其他`。关键词中的 `%`、`_` 与反斜杠不是通配符。列表响应：

```ts
interface AdminDiscoverPostList {
  summary: { totalPosts: number; totalComments: number; totalLikes: number };
  items: AdminDiscoverPost[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
  options: { categories: string[] };
}

interface AdminDiscoverPost {
  id: number;
  title: string;
  storeName: string;
  priceText: string;
  content: string;
  category: string;
  tags: string[];
  images: Array<{ url: string; width: number; height: number; sizeBytes: number; mimeType: string }>;
  coverUrl: string;
  imageCount: number;
  stats: { likeCount: number; commentCount: number };
  author: CommunityProfile;
  publishedAt: string;
  createdAt: string;
  updatedAt: string;
}
```

详情返回单个 `AdminDiscoverPost`，图片保持投稿顺序，Discover 图片仍是公共媒体。`summary` 始终统计全部未删除帖子、它们的未删除评论及有效点赞，不受筛选影响；`total` 是筛选后的帖子数。帖子发布即进入内容列表，没有待审、审批通过或驳回状态。

评论响应为 `{items,page,pageSize,total,hasMore}`，每项含 `id/postId/parentCommentId/content/author/createdAt/updatedAt`；`parentCommentId` 可空。管理 DTO 不包含 `likedByMe/isMine`，也不构造管理员的普通用户身份。目标帖子或有效评论不存在时返回 `404 + 4002`。

### 7.2 Treehole 查询

| 接口 | 语义 |
|---|---|
| `GET /api/admin/treehole/posts?page=&pageSize=&keyword=` | 未删除帖子；默认 20、最大 50；keyword 只匹配正文 |
| `GET /api/admin/treehole/posts/:id` | 按 ID 读取完整帖子，不依赖当前列表页或筛选 |
| `GET /api/admin/treehole/posts/:id/comments?page=&pageSize=` | 指定未删除帖子的评论；默认 50、最大 100 |

帖子列表响应：

```ts
interface AdminTreeholePostList {
  summary: { totalPosts: number; totalComments: number; totalLikes: number };
  items: Array<{
    id: number;
    content: string;
    images: Array<{
      url: string;
      width: number;
      height: number;
      sizeBytes: number;
      mimeType: 'image/webp';
    }>;
    imageCount: number;
    stats: { likeCount: number; commentCount: number };
    author: CommunityProfile;
    publishedAt: string;
    createdAt: string;
    updatedAt: string;
  }>;
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
}
```

详情返回与 `items[]` 相同的单个帖子 DTO；不存在或已删除时返回 `404 + 4002`。帖子按发布时间、ID 倒序；评论按创建时间、ID 倒序。评论响应为 `{items,page,pageSize,total,hasMore}`，每项含 `id/postId/parentCommentId/content/author/createdAt/updatedAt`，`parentCommentId` 可空。列表的 `summary` 为全量有效内容统计，`total` 为正文关键词筛选后的帖子数；关键词按字面匹配。

两类内容作者都只使用 Community 公共 `{ id, displayName, avatarUrl }`，不返回学号、真实姓名或完整班级。所有帖子、评论 ID 与 `page/pageSize` 必须为正安全整数；页长裁剪后校验实际 offset 为安全整数，否则返回 `400 + 4002`。

管理帖子中的图片元数据与用户侧同构，但 `url` 固定为管理读取入口：

```http
GET /api/admin/treehole/media/:mediaKey/:fileName
Cookie: huas_admin_session=...
```

管理前端以 `credentials: 'include'` 请求图片 Blob，再使用 Object URL 展示。普通用户 Bearer JWT 不能代替后台 Cookie；图片必须仍被未删除帖子引用，帖子软删除后返回 404。响应使用 `Content-Type: image/webp`、`Cache-Control: private, no-store` 和 `X-Content-Type-Options: nosniff`。

成功读取图片写 `AdminTreeholeAudit/read_treehole_post_media`，仅记录管理员、`postId` 与稳定 `mediaKey`，不记录正文、原始文件名或学校身份。浏览器私有 Blob 缓存命中不会再次触发服务端读取审计。

### 7.3 Treehole 删除

| 接口 | 返回 |
|---|---|
| `DELETE /api/admin/treehole/posts/:id` | `{ id }` |
| `DELETE /api/admin/treehole/comments/:id` | `{ id, postId }` |

两类内容删除都通过模块公开命令端口完成，Operations 不直接操作内容表。删帖只软删除帖子事实，并在同一短事务撤回对应 Outbox 事件和活动通知；关联评论、点赞事实保留，但不再通过有效帖子查询可见。单评删除只软删除目标评论，不级联删除回复，在同一事务撤回该评论的活动事件/通知并重算帖子有效评论数。帖子的媒体清理在事务外尽力执行，失败交孤儿回收处理，不撤销已提交删除；管理端不提供恢复接口。

## 8. Messaging 管理只读

| 接口 | 语义 |
|---|---|
| `GET /api/admin/messaging/conversations?page=&pageSize=` | 全部一对一会话，默认 20、最大 100 |
| `GET /api/admin/messaging/conversations/changes?afterMessageId=&limit=` | 按全局消息 ID 高水位读取变化会话 |
| `GET /api/admin/messaging/conversations/:id/messages?beforeMessageId=&afterMessageId=&limit=` | 指定会话首屏/旧历史/新增消息，默认 50、最大 100 |
| `GET /api/admin/messaging/media/:batchKey/:fileName` | 数据库仍引用的私信图片 |

会话项：

```ts
interface AdminConversation {
  id: number;
  participants: [CommunityProfile, CommunityProfile];
  lastMessage: Message | null;
  createdAt: string;
  updatedAt: string;
}
```

普通会话列表按 `updatedAt DESC, id DESC`，offset 仅供人工翻页。轮询使用 `/changes`：`afterMessageId` 可省略或为非负整数，响应按 `lastMessage.id ASC`，并返回 `{ items, afterMessageId, hasMore }`；管理员前端按会话 `id` 覆盖去重。`hasMore=true` 表示本次 limit 后仍有变化会话。

会话/消息 ID、`page/pageSize/limit` 为正安全整数，`afterMessageId` 允许 0；普通分页按最终页长校验 offset 乘积为安全整数，否则返回 `400 + 4002`。

消息结构与 [SOCIAL_API.md](./SOCIAL_API.md) 的 `Message` 完全相同，包含 `clientMessageId`，但图片 URL 使用 `/api/admin/messaging/media/*`。消息分页也与用户侧同构：无游标取最新页，`beforeMessageId` 取更旧事实，`afterMessageId` 取新增事实，二者同传返回 `400 + 4002`；三种模式均按消息 ID 升序返回。无游标/before 的 `hasMore` 表示仍有更旧消息，after 的 `hasMore` 表示仍有更新消息。会话不存在返回 `404 + 4002`。

```json
{
  "success": true,
  "data": {
    "conversationId": 7,
    "items": [{
      "id": 123,
      "conversationId": 7,
      "clientMessageId": "550e8400-e29b-41d4-a716-446655440000",
      "sender": { "id": 17, "displayName": "软工同学17", "avatarUrl": null },
      "text": "下课一起吃饭？",
      "images": [],
      "createdAt": "2026-07-31T20:10:00.000+08:00"
    }],
    "beforeMessageId": 123,
    "afterMessageId": 123,
    "hasMore": false
  }
}
```

管理员可以读取全部会话、消息正文和图片；管理面没有发送、修改、撤回、删除消息或清空会话的接口，也没有任何私信 POST/PUT/DELETE 路由。普通用户 Bearer JWT 不能代替后台 Cookie；Cookie 缺失或失效返回 401。

媒体响应使用：

```http
Cache-Control: private, no-store
X-Content-Type-Options: nosniff
```

Operations 只依赖 `MessagingOperationsQueryPort`，不直接查询 `conversations/messages/message_images`，也不解析媒体文件路径。

每次成功读取都会写 `AdminMessagingAudit` 操作日志：

- 会话列表：管理员身份、`read_conversation_list`；
- 会话增量：管理员身份、`read_conversation_changes`；
- 指定消息：管理员身份、`conversationId`、`read_conversation_messages`；
- 图片：管理员身份、`conversationId`、稳定 `storageKey`、`read_message_media`。

审计日志不得包含消息正文、图片二进制、原始文件名、学号、真实姓名或其他隐私内容；列表/增量审计也不枚举参与者。

## 9. 首页弹窗

首页弹窗是单配置展示能力，不复用公告列表，不包含人群、排序或曝光统计。服务端管理海报、三态底栏与投放状态；小程序只在 `public_account` 状态把底栏点击导向“文理校园圈”公众号。

```ts
type IndexPopupFrequency = 'once' | 'daily' | 'startup';
type IndexPopupActionType = 'public_account' | 'text' | 'none';

interface PublicIndexPopup {
  version: string;
  imageUrl: string;
  actionType: IndexPopupActionType;
  actionText: string;
  frequency: IndexPopupFrequency;
}

interface AdminIndexPopupSettings {
  enabled: boolean;
  version: string | null;
  imageUrl: string | null;
  actionType: IndexPopupActionType;
  actionText: string;
  frequency: IndexPopupFrequency;
  startsAt: string | null;
  endsAt: string | null;
  updatedAt: string | null;
}
```

### 9.1 `GET /api/public/index-popup`

无需认证。服务端先判断 `enabled`，再以 `[startsAt, endsAt)` 半开时间窗过滤；开始或结束时间为空表示该方向无边界。没有有效投放时仍返回成功响应：

```json
{ "success": true, "data": null }
```

有效时 `data` 严格只有 `version/imageUrl/actionType/actionText/frequency`。底栏语义固定为：`public_account` 显示可点击 `actionText` 并由小程序跳公众号；`text` 只显示不可点击文字；`none` 不显示底栏，返回的 `actionText` 仅为保留配置，客户端必须忽略。`imageUrl` 是 host-agnostic 相对路径 `/media/index-popup/<version>.webp`，媒体响应为 `image/webp`，使用 `public, max-age=31536000, immutable`；客户端不得拼写固定服务域名。媒体目录有界保留最近三个不可变版本并允许读取，避免配置切换期间已取得旧 DTO 的客户端访问 404。

### 9.2 `GET /api/admin/index-popup`

需要后台 Cookie，返回完整 `AdminIndexPopupSettings`。尚未配置时返回关闭状态、`frequency: "daily"`、`actionType: "public_account"` 与默认 `actionText: "了解更多"`，其余可空字段为 `null`。读取旧 `settings.json` 时，缺失 `actionType` 也按 `public_account` 兼容。

### 9.3 `PUT /api/admin/index-popup`

需要后台 Cookie，请求必须是 `multipart/form-data`，不要手写 `Content-Type`，字段如下：

| 字段 | 规则 |
|---|---|
| `enabled` | 必填字符串 `true | false` |
| `frequency` | 必填 `once | daily | startup` |
| `actionType` | `public_account | text | none`；旧调用方省略时沿用当前值 |
| `actionText` | `public_account/text` 必须为去除首尾空白后的 1–20 个字符且无控制字符；`none` 省略或传空字符串时保留已存文案 |
| `startsAt` | 可选 ISO 日期时间；空字符串清除开始时间，无时区的 datetime-local 按北京时间解释 |
| `endsAt` | 可选 ISO 日期时间；空字符串清除结束时间，必须晚于 `startsAt` |
| `image` | 可选图片；启用且此前没有图片时必填 |

上传图片经共享安全门禁读取并按原比例缩小为静态 WebP，不裁切；输入最大 10 MiB、24MP，最长边最多 2560，成品最大 2 MiB。提交新 `image`、修改 `actionType` 或修改有效 `actionText` 都生成新的 UUID `version`，使本机频控把它识别为新内容；只修改开关、时间或频率不会换版本。仅修改动作内容时服务端以新版本复制当前不可变 WebP，设置 JSON 仍使用同目录临时文件与原子 rename；配置切换失败会清理候选图片并保留旧有效配置。

## 10. 早起运营

### 10.1 `GET /api/admin/early-rising/overview`

`days` 只允许 `7 | 30 | 90`，默认 30；其他值返回 `400 + 4002`。

```ts
interface EarlyRisingAdminOverview {
  days: 7 | 30 | 90;
  range: { from: string; to: string };
  todayParticipants: number;
  totalParticipants: number;
  totalCheckins: number;
  series: Array<{ date: string; count: number }>;
}
```

`range` 包含北京时间今天及此前 `days - 1` 个日期，格式为 `YYYY-MM-DD`；`series` 逐日升序补零。`todayParticipants` 为今天有效打卡账户数，`totalParticipants` 为历史去重参与账户数，`totalCheckins` 为历史有效打卡数，两个累计字段不受 `days` 限制。每账户每天至多一条有效打卡。

### 10.2 `GET /api/admin/early-rising/leaderboard`

`period` 可省略，默认 `today`，只允许 `today | week | month`。响应 `{period,range,generatedAt,items}`，没有 `me`；管理端不传入或伪造普通用户 ID。

```ts
interface EarlyRisingAdminLeaderboardRow {
  rank: number;
  profile: { id: number; displayName: string; avatarUrl: string | null; bio: string | null };
  currentStreak: number;
  checkedAt?: string;
  continuityScore?: number;
  validDays?: number;
}
```

返回前 100 名，作者来自 Community 详细公共资料，不包含学校身份。`range` 为北京时间今天、本周一至今天或本月一日至今天。日榜按打卡时间、事实 ID 升序，行含 `checkedAt`；周/月榜按连续积分降序、有效天数降序、平均北京时间打卡时刻升序、用户 ID 升序，行含 `continuityScore/validDays`。连续积分为周期内每日连续天数（每日最多 7 分）之和，连续链可承接周期前历史。`currentStreak` 是当前连续天数，今天 09:30 之前可承接昨天，09:30 起须包含今天；不是该周或月的连续天数。

### 10.3 展示设置

`GET /api/admin/early-rising/settings` 读取 `{profileEntryVisible,updatedAt,updatedBy}`；`PUT` 接受 JSON `{profileEntryVisible:boolean}`。两者使用后台 Cookie。写入记录管理员与更新时间；普通用户 `/api/early-rising/settings` 只得到布尔投影，默认显示资料入口。非布尔值或无效 JSON 返回 400/4002。

`profileEntryVisible` 只控制排行榜资料入口的展示，不停用打卡、不清除既有资料，也不改变打卡时间窗、积分或排行规则。管理端没有代打卡、补签、改分或删除打卡事实的接口。

## 11. 运行观测

### 11.1 `GET /api/admin/runtime`

```ts
interface AdminRuntime {
  databaseStatus: 'ok' | 'error';
  memory: { rssMb: number; heapUsedMb: number; heapTotalMb: number };
  uptimeSeconds: number;
  process: {
    ready: boolean;
    shuttingDown: boolean;
    shutdownSignal: string | null;
    deploySlot: string;
  };
  metrics: Array<{ name: string; labels: Record<string, string>; value: number }>;
}
```

数据库状态来自本地 SQLite `SELECT 1`，不会访问校园上游。内存单位为 MiB，uptime 为当前进程运行的整秒数。`process` 是应用生命周期快照；`metrics` 是当前进程累计的低基数样本，与 Prometheus 读取同一指标源，重启/切槽后重新计数。

| 指标 | 标签与口径 |
|---|---|
| `huas_http_requests_total` | `method/status`，HTTP 请求次数 |
| `huas_http_request_duration_ms_count` / `_sum` | `method`，请求耗时样本数/毫秒总量，可计算平均值，不提供分位数 |
| `huas_upstream_requests_total` | `outcome=success/failure/timeout`，观察到的上游请求结果 |
| `huas_cache_access_total` | `result=hit/miss`，缓存访问次数 |
| `huas_fallback_total` | 回退次数 |
| `huas_singleflight_merge_total` | 在途请求合流次数 |
| `huas_sqlite_busy_total` | 观察到的 SQLite busy 次数 |
| `huas_analytics_flush_failure_total` | 分析批次持久化失败次数 |

运行指标不提供按学校来源拆分的健康状态，不代表历史业务总量。管理 API 不提供重启、部署、迁移、批量清缓存或手动执行周期任务的写操作。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
