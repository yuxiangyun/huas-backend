# HUAS Server Operations API 契约

> 基线：2026-07-31 当前后端实现
> Base URL：`http://localhost:3000`
> 通用响应包、错误码与时间格式见 [API.md](./API.md)；社交用户 DTO 见 [SOCIAL_API.md](./SOCIAL_API.md)

本文描述公共公告和 `/api/admin/*` 管理入口。管理端使用独立 HttpOnly Cookie，会话与普通用户 Bearer JWT 不互通。

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
  "data": { "username": "admin", "expiresInSeconds": 1800 }
}
```

同时设置 `huas_admin_session` Cookie：

- `HttpOnly`
- `SameSite=Strict`
- `Path=/api/admin`
- HTTPS 或 `X-Forwarded-Proto: https` 时设置 `Secure`
- Cookie 最大时长 8 小时

凭据错误返回 `401 + 4001`，不会设置 Cookie。

### 1.2 `GET /api/admin/session`

探测并续期当前会话的空闲时间，返回 `{ username, expiresInSeconds: 1800 }`。会话失效返回 HTTP 401。

### 1.3 `DELETE /api/admin/session`

撤销服务端 token 并删除 Cookie，返回 `{ revoked: true }`。

### 1.4 生命周期

- 服务端只在进程内保存随机 token 与会话元数据，不在 Cookie 中保存账号密码。
- 空闲 TTL 30 分钟，绝对 TTL 8 小时，进程内最多 128 条会话。
- 会话是进程内状态；重启或切槽后浏览器 Cookie 仍可能存在，但服务端会要求重新登录。
- 除 `POST /session` 外，全部 `/api/admin/*` 先经过同一会话中间件。

## 2. Dashboard

### 2.1 `GET /api/admin/dashboard`

查询参数：

| 参数 | 规则 |
|---|---|
| `page` | 用户分页，默认 1，每页固定 20 |
| `search` | 学号或姓名模糊搜索 |
| `major` | 班级筛选；未分配值为 `__UNASSIGNED__` |
| `grade` | 从学号中解析出的四位年级 |

响应由 Operations 通过 Identity、Discover 公开 query port 及自身基础设施并行聚合：

```ts
interface DashboardResponse {
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
    byMajor: Array<{ className: string; count: number }>;
    byGrade: Array<{ grade: string; count: number }>;
  };
  users: DashboardUsers;
  discover: DiscoverOperationsSnapshot;
  logs: TerminalLogResponse;
  announcements: Announcement[];
}
```

`users.items[]` 是后台身份视图，含 `studentId/name/className/grade/createdAt/lastLoginAt`。`discover` 只使用 Discover 自有事实和 Community 公共作者投影：

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

读取 overview 前会先 flush 当前进程批次。分析记录按北京日期、平台与指标聚合，不保存请求正文、消息正文或图片内容。

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

请求 `{ "mode": "jw-first" }`。`mode` 只允许 `jw-first | portal-first`。

- 只影响后续 `/api/schedule` 的来源顺序，不清缓存、不主动访问校园上游。
- 同目录临时文件加原子 rename；写失败保留旧有效快照。
- 首次没有有效文件时回落 `SCHEDULE_SOURCE_MODE`，再回落 `jw-first`。

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

来源固定为 `logs/pm2-out.log` 与 `logs/pm2-error.log`。文件不存在或读取失败时降级为空列表；服务只执行有界尾部扫描，不返回任意文件。

## 7. Discover/Treehole 管理

### 7.1 Discover

`DELETE /api/admin/discover/posts/:id` 删除任意未删除 Discover 帖子，成功返回 `{ id }`。Operations 只调用 Discover 管理命令端口，不直接操作表。

### 7.2 Treehole 查询

| 接口 | 语义 |
|---|---|
| `GET /api/admin/treehole/posts?page=&pageSize=&keyword=` | 未删除帖子；默认 20、最大 50；keyword 只匹配正文 |
| `GET /api/admin/treehole/posts/:id/comments?page=&pageSize=` | 指定未删除帖子的评论；默认 50、最大 100 |

帖子列表响应：

```ts
interface AdminTreeholePostList {
  summary: { totalPosts: number; totalComments: number; totalLikes: number };
  items: Array<{
    id: number;
    content: string;
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

评论项含 `id/postId/content/author/createdAt/updatedAt`。作者只使用 `{ id, displayName, avatarUrl }`，不返回学号、真实姓名或完整班级。

### 7.3 Treehole 删除

| 接口 | 返回 |
|---|---|
| `DELETE /api/admin/treehole/posts/:id` | `{ id }` |
| `DELETE /api/admin/treehole/comments/:id` | `{ id, postId }` |

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
