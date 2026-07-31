# HUAS Server 社交后端 API 契约

> 基线：2026-07-31 当前后端实现
> Base URL：`http://localhost:3000`
> 响应包、Bearer JWT、后台 Cookie、错误码与时间格式见 [API.md](./API.md)

本文是 Community、Discover、Treehole、Notifications 与 Messaging 用户侧能力的唯一 API 语义源；管理入口详见 [OPERATIONS_API.md](./OPERATIONS_API.md)。所有社交事实绑定 `users.id`；“树洞”只是产品名称，内容始终返回作者。

## 1. 边界与认证

| 路径 | 认证 | 边界 |
|---|---|---|
| `/api/community/*` | Bearer JWT | 当前资料读写与公共用户资料 |
| `/api/discover/*` | Bearer JWT | Discover 帖子、点赞、评论与用户帖子 |
| `/api/treehole/*` | Bearer JWT | Treehole 帖子、点赞、评论与用户帖子 |
| `/api/notifications/*` | Bearer JWT | 六类活动通知、未读数与逐条已读 |
| `/api/messaging/*` | Bearer JWT | 一对一会话、消息、阅读游标与参与者媒体 |
| `/api/admin/discover/*` | 后台 HttpOnly Cookie | Discover 管理删除 |
| `/api/admin/treehole/*` | 后台 HttpOnly Cookie | Treehole 管理查询与删除 |
| `/api/admin/messaging/*` | 后台 HttpOnly Cookie | 私信会话、消息与媒体只读查询 |
| `/media/discover/*` | 无 | 仍属于未删除帖子的公开图片 |
| `/media/treehole-avatar/*` | 无 | Community 当前仍发布的公开头像；路径名为迁移兼容保留 |

社交公开响应不会返回学号、真实姓名或完整班级。Discover、Treehole、Notifications 与 Messaging 先查询各自事实，再批量投影 Community 资料。

## 2. 共享响应类型

### 2.1 `CommunityProfile`

```ts
interface CommunityProfile {
  id: number;
  displayName: string;
  avatarUrl: string | null;
}
```

- 自定义昵称允许重复，空昵称等同未设置。
- 未设置昵称时，取 `className` 第一个数字前的前缀，生成 `{前缀}同学{id}`。
- 班级为空或没有可用前缀时生成 `文理er {id}`。
- `avatarUrl = null` 表示未设置 Community 头像。

### 2.2 分页

```ts
interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
}
```

所有 JSON 接口继续使用统一成功包：

```json
{ "success": true, "data": {} }
```

## 3. Community

### 3.1 `GET /api/community/profile`

返回当前登录用户的 `CommunityProfile`。当前 JWT 指向的用户不存在时返回 `404 + 4002`。

### 3.2 `PUT /api/community/profile`

请求必须为 `multipart/form-data`，至少提交一个字段：

| 字段 | 类型 | 规则 |
|---|---|---|
| `nickname` | string | trim 后保存；空字符串清除昵称并恢复默认 displayName |
| `avatar` | File | 非空图片，默认最大 2MB |

头像支持 JPG、PNG、WebP、GIF、HEIC/HEIF、AVIF、TIFF。服务端识别真实格式、自动旋转，按默认 `512 × 512` cover 和质量 `78` 输出 WebP；新文件使用不可变 `{userId}-{uuid}.webp` 名称。资料写入失败时会补偿删除候选头像。

成功返回更新后的 `CommunityProfile`。

### 3.3 `DELETE /api/community/profile/avatar`

清除当前用户头像并返回更新后的 `CommunityProfile`。昵称不受影响。

### 3.4 `GET /api/community/users/:id`

返回指定用户的公共 `CommunityProfile`。`id` 必须是正整数；用户不存在返回 `404 + 4002`。该接口不返回校园身份字段、评论历史或点赞历史。

### 3.5 `GET /media/treehole-avatar/:fileName`

公开文件响应，不使用 JSON envelope。服务端只在 `community_profiles.avatar_url` 当前仍发布该路径时读取文件：

- 新文件名：`{userId}-{uuid}.webp`
- 迁移兼容文件名：`{userId}.webp`
- `Cache-Control: public, max-age=31536000, immutable`

## 4. Discover

### 4.1 类型

```ts
interface DiscoverImage {
  url: string;
  width: number;
  height: number;
  sizeBytes: number;
  mimeType: string;
}

interface DiscoverPost {
  id: number;
  title: string;
  storeName: string;
  priceText: string;
  content: string;
  category: string;
  tags: string[];
  images: DiscoverImage[];
  coverUrl: string;
  imageCount: number;
  commentCount: number;
  likeCount: number;
  likedByMe: boolean;
  author: CommunityProfile;
  isMine: boolean;
  publishedAt: string;
  createdAt: string;
  updatedAt: string;
}

interface DiscoverComment {
  id: number;
  postId: number;
  parentCommentId: number | null;
  content: string;
  author: CommunityProfile;
  isMine: boolean;
  createdAt: string;
  updatedAt: string;
}
```

帖子列表返回 `Page<DiscoverPost>`，评论列表返回 `Page<DiscoverComment>`。

### 4.2 `GET /api/discover/meta`

返回分类、常用标签、`latest | popular | recommended` 三种排序及限制：

| 限制 | 默认值 |
|---|---:|
| 每帖图片 | 9 |
| 每帖标签 | 6 |
| 标题 | 80 字 |
| 单标签 | 12 字 |
| 店名 | 32 字 |
| 价格文本 | 20 字 |
| 正文 | 400 字 |
| 评论 | 200 字 |

### 4.3 `POST /api/discover/posts`

创建并发布帖子。请求必须为 `multipart/form-data`：

| 字段 | 必填 | 规则 |
|---|---|---|
| `title` | 是 | trim 后非空，最多 80 字 |
| `storeName` | 否 | 最多 32 字；空值返回空字符串 |
| `priceText` | 否 | 最多 20 字；空值返回空字符串 |
| `content` | 是 | trim 后非空，最多 400 字 |
| `category` | 是 | `1食堂/2食堂/3食堂/5食堂/校外/其他` |
| `tags` / `tags[]` | 是 | 至少一个；可重复字段、逗号/换行分隔或 JSON 数组字符串 |
| `images` / `images[]` | 是 | 1–9 张 |

单张原图默认最大 32MB；支持主流图片与 HEIC/HEIF，自动旋转，最长边 1280、质量 78，落盘只保留 WebP。成功返回 `201 + DiscoverPost`。

### 4.4 帖子查询

| 接口 | 查询参数 | 语义 |
|---|---|---|
| `GET /api/discover/posts` | `sort/category/page/pageSize` | 公共列表，默认 `latest`，默认 20、最大 50 |
| `GET /api/discover/posts/me` | `category/page/pageSize` | 当前用户未删除帖子，按最新排序 |
| `GET /api/discover/users/:userId/posts` | `category/page/pageSize` | 指定用户未删除帖子，按最新排序 |
| `GET /api/discover/posts/:id` | - | 帖子详情 |

Discover 的非法 `page/pageSize` 会回落到默认值；非法分类或排序返回 `400 + 4002`。

排序规则：

- `latest`：`publishedAt DESC, id DESC`。
- `popular`：`likeCount DESC, publishedAt DESC, id DESC`。
- `recommended`：累计当前用户点赞帖的分类/标签权重；按匹配分、点赞数、发布时间、ID 排序。没有点赞偏好或没有匹配候选时回退 `latest`。

### 4.5 点赞

| 接口 | 语义 |
|---|---|
| `POST /api/discover/posts/:id/like` | 幂等点赞，返回更新后的 `DiscoverPost` |
| `DELETE /api/discover/posts/:id/like` | 幂等取消点赞，返回更新后的 `DiscoverPost` |

禁止点赞自己的帖子，违反时返回 `400 + 4002`。有效点赞会创建 `discover_like` 活动事件；有效取消点赞会在同一事务撤销对应通知。

### 4.6 评论

| 接口 | 请求/查询 | 返回 |
|---|---|---|
| `GET /api/discover/posts/:id/comments` | `page/pageSize`，默认 50、最大 100 | `Page<DiscoverComment>` |
| `POST /api/discover/posts/:id/comments` | JSON `{ content, parentCommentId? }` | `201 + DiscoverComment` |
| `DELETE /api/discover/comments/:id` | 仅评论作者 | `{ id, postId }` |

`parentCommentId` 必须属于同一帖子。普通评论产生 `discover_comment`，回复产生 `discover_comment_reply`。

### 4.7 删除与媒体

- `DELETE /api/discover/posts/:id`：仅作者删除自己的帖子，返回 `{ id }`。
- Discover 管理删除见 [OPERATIONS_API.md](./OPERATIONS_API.md#71-discover)。
- `GET /media/discover/:storageKey/:fileName`：公开文件响应；只有帖子仍未删除时才读取，使用 immutable 缓存。

## 5. Treehole

“树洞”帖子和评论都显式绑定用户，并返回统一 `author: CommunityProfile`。

### 5.1 类型

```ts
interface TreeholePost {
  id: number;
  content: string;
  author: CommunityProfile;
  stats: { likeCount: number; commentCount: number };
  viewer: { liked: boolean; isMine: boolean };
  publishedAt: string;
  createdAt: string;
  updatedAt: string;
}

interface TreeholeComment {
  id: number;
  postId: number;
  parentCommentId: number | null;
  content: string;
  author: CommunityProfile;
  isMine: boolean;
  createdAt: string;
  updatedAt: string;
}
```

### 5.2 元信息与帖子

| 接口 | 语义 |
|---|---|
| `GET /api/treehole/meta` | 正文 500、评论 200；帖子分页默认 20/最大 50，评论默认 50/最大 100 |
| `GET /api/treehole/posts` | 公共未删除帖子 |
| `GET /api/treehole/posts/me` | 当前用户未删除帖子 |
| `GET /api/treehole/users/:userId/posts` | 指定用户未删除帖子 |
| `POST /api/treehole/posts` | JSON `{ content }`，成功返回 `201 + TreeholePost` |
| `GET /api/treehole/posts/:id` | 帖子详情 |
| `DELETE /api/treehole/posts/:id` | 仅作者删除，返回 `{ id }` |

分页参数必须是正整数，否则返回 `400 + 4002`。正文 trim 后不能为空且最多 500 字。

### 5.3 点赞与评论

| 接口 | 语义 |
|---|---|
| `PUT /api/treehole/posts/:id/like` | 幂等点赞，禁止自赞 |
| `DELETE /api/treehole/posts/:id/like` | 幂等取消点赞 |
| `GET /api/treehole/posts/:id/comments` | 评论列表 |
| `POST /api/treehole/posts/:id/comments` | JSON `{ content, parentCommentId? }`，返回 `201` |
| `DELETE /api/treehole/comments/:id` | 仅评论作者删除，返回 `{ id, postId }` |

有效互动分别产生 `treehole_like/treehole_comment/treehole_comment_reply` 事件；取消点赞撤销对应通知。

### 5.4 Treehole 管理接口

Discover/Treehole 的后台查询与删除契约见 [OPERATIONS_API.md](./OPERATIONS_API.md#7-discovertreehole-管理)。管理作者仍是 `CommunityProfile`，不返回学号、真实姓名或完整班级。

## 6. Notifications

### 6.1 固定事件

```ts
type NotificationType =
  | 'discover_like'
  | 'discover_comment'
  | 'discover_comment_reply'
  | 'treehole_like'
  | 'treehole_comment'
  | 'treehole_comment_reply';

type ResourceType = 'discover_post' | 'treehole_post';
```

```ts
interface Notification {
  id: number;
  actor: CommunityProfile;
  type: NotificationType;
  resourceType: ResourceType;
  resourceId: number;
  subresourceId: number | null;
  readAt: string | null;
  createdAt: string;
}
```

### 6.2 HTTP 接口

| 接口 | 返回 |
|---|---|
| `GET /api/notifications?page=&pageSize=` | `Page<Notification>`；默认 20、最大 50 |
| `GET /api/notifications/unread-count` | `{ unreadCount }` |
| `PUT /api/notifications/:id/read` | `{ id, read: true }` |

分页参数和通知 ID 必须是正整数。单条已读以 recipient 隔离且幂等；不存在或不属于当前用户均返回 `404 + 4002`。没有“全部已读”接口。

### 6.3 生成与生命周期

- 自我互动不生成通知。
- 普通评论通知帖子作者。
- 回复通知父评论作者；帖子作者不同时也通知帖子作者，同一 recipient 自动去重。
- 一次有效互动面向每个 recipient 生成一个稳定 `eventId`，重复投影不会重复通知。
- 点赞/评论事实与 `activity_outbox` 在同一 SQLite 事务提交；请求提交后立即尝试投影，后台每 5 秒重试失败事件。
- 有效取消点赞同时删除未投影 Outbox 和已投影通知，后续重试不会复活。
- 通知只保存稳定内容引用，不保存互动正文；内容删除不会级联删除旧通知，访问目标时可得到 404。
- 已读通知默认保留 90 天后由周期任务清理；未读通知不受该清理影响。
- Messaging 不写活动通知，私信未读直接由消息事实和会话阅读游标计算。

## 7. Messaging

### 7.1 类型

```ts
interface MessageImage {
  id: number;
  url: string;
  width: number;
  height: number;
  sizeBytes: number;
  mimeType: string;
}

interface Message {
  id: number;
  conversationId: number;
  sender: CommunityProfile;
  text: string | null;
  images: MessageImage[];
  createdAt: string;
}

interface Conversation {
  id: number;
  otherUser: CommunityProfile;
  lastMessage: Message | null;
  unreadCount: number;
  createdAt: string;
  updatedAt: string;
}
```

### 7.2 会话与增量消息

| 接口 | 返回 |
|---|---|
| `GET /api/messaging/conversations?page=&pageSize=` | `Page<Conversation>`；默认 20、最大 100 |
| `GET /api/messaging/conversations/:id/messages?afterMessageId=&limit=` | 增量消息列表，默认 50、最大 100 |
| `GET /api/messaging/unread-count` | `{ unreadCount }` |
| `PUT /api/messaging/conversations/:id/read` | 阅读游标与剩余未读数 |

增量响应：

```ts
interface MessageList {
  conversationId: number;
  items: Message[];
  afterMessageId: number | null;
  hasMore: boolean;
}

interface MarkReadResult {
  conversationId: number;
  lastReadMessageId: number | null;
  unreadCount: number;
}
```

`PUT .../read` 可发送 JSON `{ "throughMessageId": 123 }`；不提供时推进到会话当前最后一条消息。游标只前进不后退，目标消息必须属于该会话。非参与者与不存在的会话统一返回 404。

### 7.3 `POST /api/messaging/users/:userId/messages`

请求必须为 `multipart/form-data`，并携带：

```http
Idempotency-Key: <uuid>
```

| 字段 | 规则 |
|---|---|
| `text` | 可选；trim 后最多 1000 Unicode code point |
| `images` / `images[]` | 可选；最多 9 张 |

至少有非空文字或一张图片。禁止给自己发私信，接收用户必须存在。

图片规则：

- 单张原图最大 32MB。
- 一条消息全部原图合计最大 64MB。
- 支持 JPG、PNG、WebP、GIF、HEIC/HEIF、AVIF、TIFF。
- 自动旋转，最长边 1280、质量 78，保存为 WebP。
- 所有图片先在 SQLite 事务外转换；消息和全部图片元数据在一个短事务内提交，任一失败不会留下部分消息。

同一发送者的同一 UUID 只对应一条消息。重试返回原消息，不会再次转换图片或计入发送限流；若同一 key 已用于另一个接收者，返回 `400 + 4002`。

会话没有单独创建接口。首条消息成功时，服务端按有序用户对在同一事务中幂等创建唯一会话。每用户最多成功发送 30 条/分钟，超限返回 `429 + 4003`。

### 7.4 私有媒体

`GET /api/messaging/media/:batchKey/:fileName` 只允许会话参与者读取 `message_images` 当前引用的文件。成功直接返回 `image/webp`：

```http
Cache-Control: private, no-store
X-Content-Type-Options: nosniff
```

文件位于 `dirname(DB_PATH)/message-media/{batchUuid}/01.webp` 等路径。消息与已引用图片没有用户删除接口并永久保留；周期任务只删除超过安全年龄且没有数据库引用的候选目录。

## 8. Messaging 管理只读入口

管理员可读取全部私信会话、正文和图片，但不能修改或删除。完整 Cookie、分页、管理媒体与 Operations port 契约见 [OPERATIONS_API.md](./OPERATIONS_API.md#8-messaging-管理只读)。

## 9. 轮询与日志契约

以下成功 GET 被视为高频轮询，不写文件访问日志，但 HTTP metrics 仍完整统计：

- `/api/notifications`
- `/api/notifications/unread-count`
- `/api/messaging/unread-count`
- `/api/messaging/conversations`
- `/api/messaging/conversations/:id/messages`

轮询的 4xx/5xx、发送、阅读游标和其他写操作仍记录。日志只记录对象 ID、数量和字节统计，不记录消息正文、原文件名或图片内容。
