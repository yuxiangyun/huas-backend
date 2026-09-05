# HUAS Server Operations API 契约

> 基线：2026-08-01 当前后端实现
> Base URL：`http://localhost:3000`
> 通用响应包、错误码与时间格式见 [API.md](./API.md)；社交用户 DTO 见 [SOCIAL_API.md](./SOCIAL_API.md)

本文描述公共公告、首页弹窗和 `/api/admin/*` 管理入口。管理端使用独立 HttpOnly Cookie，会话与普通用户 Bearer JWT 不互通。

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

请求 `{ "mode": "jw-first" }`。`mode` 只允许 `mobile-jw-first | jw-first | portal-first`。Admin → 系统设置 → 课表数据源提供三个选项；移动教务优先按移动教务、JW、Portal 依次读取 current，均失败后再同序尝试 stale。旧两个模式保留原双源行为。

- 只影响后续 `/api/schedule` 的来源顺序，不清缓存、不主动访问校园上游。
- 同目录临时文件加原子 rename；写失败保留旧有效快照。
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

评论项含 `id/postId/content/author/createdAt/updatedAt`。作者只使用 `{ id, displayName, avatarUrl }`，不返回学号、真实姓名或完整班级。

管理帖子中的图片元数据与用户侧同构，但 `url` 固定为管理读取入口：

```http
GET /api/admin/treehole/media/:mediaKey/:fileName
Cookie: huas_admin_session=...
```

管理前端以 `credentials: 'include'` 请求图片 Blob，再使用 Object URL 展示。普通用户 Bearer JWT 不能代替后台 Cookie；图片必须仍被未删除帖子引用，帖子软删除后返回 404。响应使用 `Content-Type: image/webp`、`Cache-Control: private, no-store` 和 `X-Content-Type-Options: nosniff`。

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
