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

interface CurrentCommunityProfile extends CommunityProfile {
  nickname: string | null;
}
```

- `CommunityProfile` 是公共资料，只含三个字段；`CurrentCommunityProfile` 只用于当前登录用户资料，多出的 `nickname` 供编辑框回填和区分系统缺省名。
- 自定义昵称允许重复。服务端先 trim；空字符串清除自定义昵称，`nickname` 返回 `null`，缺省名只作为 `displayName` 计算，绝不写回 `nickname`。
- 非空昵称按 Unicode code point 计数，必须为 2–12 个字符；控制字符、换行及保留名 `管理员/官方/系统/匿名用户` 返回 `400 + 4002`。
- 未设置昵称时，取 `className` 第一个数字前的有效前缀。例如 `软工24101班 + userId=17` 得到 `软工同学17`。
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

返回当前登录用户的 `CurrentCommunityProfile`。当前 JWT 指向的用户不存在时返回 `404 + 4002`。

```json
{
  "success": true,
  "data": {
    "id": 17,
    "displayName": "软工同学17",
    "avatarUrl": null,
    "nickname": null
  }
}
```

### 3.2 `PUT /api/community/profile`

请求必须为 `multipart/form-data`，至少提交一个字段：

| 字段 | 类型 | 规则 |
|---|---|---|
| `nickname` | string | trim 后保存；空字符串清除昵称并恢复默认 displayName |
| `avatar` | File | 非空图片，默认最大 2MB |

头像支持 JPG、PNG、WebP、GIF、HEIC/HEIF、AVIF、TIFF。服务端识别真实格式、自动旋转，按默认 `512 × 512` cover 和质量 `78` 输出 WebP；新文件使用不可变 `{userId}-{uuid}.webp` 名称。multipart 总请求在解析前按“头像上限 + 1MB 协议开销”限制，所有字段都计入，超限返回 `413 + 4002`。

昵称与头像使用字段级原子 patch，互相并发更新不会覆盖另一字段。资料写入失败会补偿删除候选头像；切换成功后仅在数据库确认旧 URL 已无任何资料引用时清理旧文件。

成功返回更新后的 `CurrentCommunityProfile`。示例：

```http
PUT /api/community/profile
Authorization: Bearer <token>
Content-Type: multipart/form-data; boundary=...

nickname=<space><space>小湘<space><space>
```

```json
{
  "success": true,
  "data": {
    "id": 17,
    "displayName": "小湘",
    "avatarUrl": null,
    "nickname": "小湘"
  }
}
```

### 3.3 `DELETE /api/community/profile/avatar`

清除当前用户头像并返回更新后的 `CurrentCommunityProfile`。昵称不受影响。

### 3.4 `GET /api/community/users/:id`

返回指定用户的公共 `CommunityProfile`。`id` 必须是正整数；用户不存在返回 `404 + 4002`。该接口永远不返回 `nickname`、校园身份字段、评论历史或点赞历史。

```json
{
  "success": true,
  "data": { "id": 17, "displayName": "小湘", "avatarUrl": null }
}
```

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

单张原图默认最大 32MB；支持主流图片与 HEIC/HEIF，自动旋转，最长边 1280、质量 78，落盘只保留 WebP。multipart 总请求在解析前按“最大图片数 × 单图上限 + 1MB 协议开销”限制，图片和无关字段都计入，超限返回 `413 + 4002`。成功返回 `201 + DiscoverPost`。

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
| `PUT /api/discover/posts/:id/like` | 幂等点赞，返回 `{ postId, liked, likeCount }` |
| `DELETE /api/discover/posts/:id/like` | 幂等取消点赞，返回 `{ postId, liked, likeCount }` |

Discover 与 Treehole 点赞协议完全一致：重复 `PUT` 保持 `liked=true`，重复 `DELETE` 保持 `liked=false`，不会重复事实或通知。禁止点赞自己的帖子，违反时返回 `400 + 4002`。目标不存在返回 `404 + 4002`。有效点赞会创建 `discover_like` 活动事件；有效取消点赞会在同一事务撤销对应通知。

```json
{ "success": true, "data": { "postId": 42, "liked": true, "likeCount": 8 } }
```

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

两个点赞接口同样返回 `{ postId, liked, likeCount }`。有效互动分别产生 `treehole_like/treehole_comment/treehole_comment_reply` 事件；取消点赞撤销对应通知。

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
| `GET /api/notifications/changes?afterNotificationId=&limit=` | 稳定 ID 增量；默认 20、最大 50 |
| `GET /api/notifications/unread-count` | `{ unreadCount, total }`；total 是当前 recipient 的通知快照总量 |
| `PUT /api/notifications/:id/read` | `{ id, read: true }` |

普通列表按 `createdAt DESC, id DESC`，offset 分页只用于人工翻页，不用于轮询。增量入口接收非负 `afterNotificationId`，按 `id ASC` 返回严格大于高水位的新通知；响应中的 `afterNotificationId` 是本页最后一个 ID（空页保持请求值），`hasMore=true` 表示本次 limit 之后仍有新通知。前端继续传回新高水位以发现新增；当轮询摘要的 `total` 与当前列表快照不同，再重取一次普通列表完成 unlike 删除校准，不在客户端复制服务端排序或永久追加模型。

```json
{
  "success": true,
  "data": {
    "items": [{
      "id": 91,
      "actor": { "id": 17, "displayName": "软工同学17", "avatarUrl": null },
      "type": "treehole_comment_reply",
      "resourceType": "treehole_post",
      "resourceId": 42,
      "subresourceId": 106,
      "readAt": null,
      "createdAt": "2026-07-31T20:00:00.000+08:00"
    }],
    "afterNotificationId": 91,
    "hasMore": false
  }
}
```

分页参数和通知 ID 必须是正整数。单条已读以 recipient 隔离且幂等；不存在或不属于当前用户均返回 `404 + 4002`。通知页不会自动清空，且没有“全部已读”接口。

### 6.3 生成与生命周期

- 自我互动不生成通知。
- 普通评论通知帖子作者。
- 回复通知父评论作者；帖子作者不同时也通知帖子作者，同一 recipient 自动去重。
- 一次有效互动面向每个 recipient 生成一个稳定 `eventId`，重复投影不会重复通知。
- 点赞/评论事实与 `activity_outbox` 在同一 SQLite 事务提交；请求提交后立即尝试投影，后台每 5 秒重试失败事件。
- 有效取消点赞同时删除未投影 Outbox 和已投影通知，后续重试不会复活。
- 通知只保存稳定内容引用，不保存互动正文；内容删除不会级联删除旧通知，访问目标时可得到 404。
- 第一版通知永久保留，已读仅改变当前 recipient 的角标/视觉状态；没有清理、归档或合并任务。
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
  clientMessageId: string;
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

`clientMessageId` 在发送响应、首屏历史、before 历史和 after 增量中始终返回；前端用它把乐观消息与服务端消息合并。

### 7.2 会话定位、普通翻页与稳定增量

| 接口 | 返回 |
|---|---|
| `GET /api/messaging/conversations?page=&pageSize=` | `Page<Conversation>`；默认 20、最大 100 |
| `GET /api/messaging/conversations/changes?afterMessageId=&limit=` | 会话变化的全局消息 ID 高水位增量 |
| `GET /api/messaging/users/:userId/conversation` | `{ profile, conversationId }`，只定位不创建 |
| `GET /api/messaging/conversations/:id/messages?beforeMessageId=&afterMessageId=&limit=` | 首屏/历史/新增三态消息 |
| `GET /api/messaging/unread-count` | `{ unreadCount }` |
| `PUT /api/messaging/conversations/:id/read` | 阅读游标与剩余未读数 |

普通会话列表按 `updatedAt DESC, id DESC`，offset 只用于用户翻页。轮询必须使用 `/conversations/changes`：`afterMessageId` 可省略或为非负整数，服务端按会话当前 `lastMessageId ASC` 返回严格大于高水位的变化会话。响应高水位是本页最后一条会话的 `lastMessage.id`（空页保持请求值），`hasMore` 表示 limit 后还有变化；前端按 `Conversation.id` 覆盖去重。

从帖子、评论、通知 actor 或用户主页进入聊天前调用定位接口：目标必须存在，查询自己返回 `400 + 4002`，目标不存在返回 `404 + 4002`。没有历史时返回 `conversationId: null`，且不会创建空会话：

```json
{
  "success": true,
  "data": {
    "profile": { "id": 28, "displayName": "软工同学28", "avatarUrl": null },
    "conversationId": null
  }
}
```

### 7.3 消息首屏、历史与新增

`beforeMessageId` 和 `afterMessageId` 不能同时提交，否则返回 `400 + 4002`。三种模式最终都按消息 `id ASC` 返回：

| 查询 | 选择方向 | `hasMore` 精确含义 |
|---|---|---|
| 无游标 | 最新 `limit` 条，再升序返回 | 当前页最老消息之前仍有更旧消息 |
| `beforeMessageId=N` | `id < N` 的最新 `limit` 条 | 本页最老消息之前仍有更旧消息 |
| `afterMessageId=N` | `id > N` 的最早 `limit` 条 | 本页最新消息之后仍有更新消息 |

`beforeMessageId`/`afterMessageId` 响应字段分别是本页最老/最新消息 ID；空 before/after 页保留对应请求游标，便于连续轮询。不存在或非参与者访问均返回 `404 + 4002`。

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

阅读响应：

```ts
interface MarkReadResult {
  conversationId: number;
  lastReadMessageId: number | null;
  unreadCount: number;
}
```

`PUT .../read` 可发送 JSON `{ "throughMessageId": 123 }`；不提供时推进到会话当前最后一条消息。游标只前进不后退，目标消息必须属于该会话。`GET /api/messaging/unread-count` 的 `unreadCount` 是未读消息条数，不是未读会话数。

### 7.4 `POST /api/messaging/users/:userId/messages`

请求必须为 `multipart/form-data`，并携带客户端生成的 UUID：

```http
POST /api/messaging/users/28/messages
Authorization: Bearer <token>
Idempotency-Key: 550e8400-e29b-41d4-a716-446655440000
Content-Type: multipart/form-data; boundary=...

text=下课一起吃饭？
images=<photo-1.jpg>
images=<photo-2.heic>
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
- Nginx、`Content-Length` 预检和 Hono 流式 body-limit 都限制明显超限请求；请求体超限稳定返回 `413 + 4002`，图片数量/单图/总量/格式错误返回 `400 + 4002`。

同一发送者的同一 UUID 只对应一条消息。网络重试必须复用原 UUID、原接收人和相同的规范化图文内容；服务端返回原消息且不重复建会话、落事实或计入发送限流。图片重试会生成临时候选 WebP 做严格内容比较，比较后删除候选。相同 UUID 改变接收人、文字或图片均返回 `400 + 4002`。

成功响应就是完整 `Message`，其中 `clientMessageId` 与请求头一致。文字最多 1000 Unicode code point、每条最多 9 图，纯文字、纯图片、文字加多图都合法，但二者不能同时为空。

```json
{
  "success": true,
  "data": {
    "id": 123,
    "conversationId": 7,
    "clientMessageId": "550e8400-e29b-41d4-a716-446655440000",
    "sender": { "id": 17, "displayName": "软工同学17", "avatarUrl": null },
    "text": "下课一起吃饭？",
    "images": [{
      "id": 9,
      "url": "/api/messaging/media/5ea55c12-9b5a-4d90-b331-b3f6a2dd4cec/01.webp",
      "width": 1280,
      "height": 960,
      "sizeBytes": 187234,
      "mimeType": "image/webp"
    }],
    "createdAt": "2026-07-31T20:10:00.000+08:00"
  }
}
```

会话没有单独创建接口。首条消息成功时，服务端按有序用户对在同一事务中幂等创建唯一会话。每用户最多成功发送 30 条/分钟，超限返回 `429 + 4003`。

### 7.5 私有媒体与前端 Blob 协议

`GET /api/messaging/media/:batchKey/:fileName` 只允许会话参与者读取 `message_images` 当前引用的文件。成功直接返回 `image/webp`：

```http
Cache-Control: private, no-store
X-Content-Type-Options: nosniff
```

文件位于 `dirname(DB_PATH)/message-media/{batchUuid}/01.webp` 等路径。消息与已引用图片没有用户删除接口并永久保留；周期任务只删除超过安全年龄且没有数据库引用的候选目录。

普通 `<img src>` 不会携带 Bearer Token。前端必须用带认证的 `fetch(url)` 取得 `Blob`，再用 `URL.createObjectURL(blob)` 作为图片地址；组件卸载或缓存淘汰时调用 `URL.revokeObjectURL(objectUrl)`。按服务端媒体 `url` 做 Promise/Object URL 去重缓存，避免会话列表、历史和增量重复下载同一图片；401 时走统一重新登录，404 显示图片不可用。不要把 Object URL 持久化。

### 7.6 独立未读入口与错误矩阵

私信和活动通知是两套事实、两套入口：分别轮询 `/api/messaging/unread-count` 与 `/api/notifications/unread-count`，客户端可相加生成“消息”Tab 总红点并在超过 99 时显示 `99+`。读取一侧不会清除另一侧。

| HTTP | 社交接口真实语义 |
|---:|---|
| 400 + `4002` | ID/分页/游标/昵称/图文/UUID 不合法、before/after 同传、自赞或给自己私信 |
| 401 + `4001` | Bearer JWT 缺失、无效或过期；包括私信图片 fetch |
| 404 + `4002` | 用户/帖子/评论/通知/会话/媒体不存在，或无权读取会话/媒体 |
| 413 + `4002` | Community、Discover 或 Messaging multipart 请求体在解析前超过各自应用上限 |

```json
{
  "success": false,
  "error_code": 4002,
  "error_message": "beforeMessageId 和 afterMessageId 不能同时提交"
}
```

## 8. Messaging 管理只读入口

管理员可读取全部私信会话、正文和图片，但不能修改或删除。完整 Cookie、分页、管理媒体与 Operations port 契约见 [OPERATIONS_API.md](./OPERATIONS_API.md#8-messaging-管理只读)。

## 9. 轮询与日志契约

以下成功 GET 被视为高频轮询，不写文件访问日志，但 HTTP metrics 仍完整统计：

- `/api/notifications`
- `/api/notifications/changes`
- `/api/notifications/unread-count`
- `/api/messaging/unread-count`
- `/api/messaging/conversations`
- `/api/messaging/conversations/changes`
- `/api/messaging/conversations/:id/messages`

轮询的 4xx/5xx、发送、阅读游标和其他写操作仍记录。日志只记录对象 ID、数量和字节统计，不记录消息正文、原文件名或图片内容。
