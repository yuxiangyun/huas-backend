# HUAS Server API 文档

> 基线日期：2026-04-01
> Base URL：`http://localhost:3000`
> 时区约定：服务端固定使用 `Asia/Shanghai`，文档中的时间示例均为 `+08:00`

## 1. 认证与路由矩阵

| 路径 | 认证方式 | 说明 |
|---|---|---|
| `POST /auth/login` | 无 | CAS 登录，获取本服务 JWT |
| `GET /health` | 无 | 健康检查 |
| `GET /api/public/announcements` | 无 | 公告弹窗列表 |
| `GET /status` | Basic Auth | 管理状态页 HTML |
| `GET /api/admin/dashboard` | Basic Auth | 管理仪表盘 |
| `GET/PUT /api/admin/compliance/ugc` | Basic Auth | UGC 正常/合规模式热开关 |
| `GET/POST/PUT/DELETE /api/admin/announcements*` | Basic Auth | 公告管理 |
| `GET /api/admin/logs` | Basic Auth | 终端日志读取 |
| `DELETE /api/admin/discover/posts/:id` | Basic Auth | Discover 管理删帖 |
| `GET/DELETE /api/admin/treehole/*` | Basic Auth | Treehole 管理接口 |
| `GET /api/schedule` | Bearer JWT | JW 优先课表，JW 失败时可回退 Portal |
| `GET /api/v1/schedule` | Bearer JWT | Portal 优先课表；周视图请求失败时可回退 JW |
| `GET /api/calendar/link` | Bearer JWT | 获取当前用户日历订阅链接 |
| `GET /api/grades` | Bearer JWT | 成绩 |
| `GET /api/ecard` | Bearer JWT | 一卡通余额 |
| `GET /api/user` | Bearer JWT | 用户资料 |
| `GET/POST/DELETE /api/discover/*` | Bearer JWT | 发现美食接口 |
| `GET/POST/PUT/DELETE /api/treehole/*` | Bearer JWT | 树洞接口 |
| `GET /calendar/schedule.ics` | `studentId + sig` 查询参数 | 本周课表 ICS 订阅 |
| `GET /media/discover/*` | 无 | 发现美食图片访问，仅未删除帖子可访问 |
| `GET /media/treehole-avatar/*` | 无 | 树洞头像访问，仅当前仍绑定该头像的用户可访问 |

Bearer Token 使用：

```http
Authorization: Bearer <token>
```

管理员接口与 `/status` 使用 HTTP Basic Auth：

```http
Authorization: Basic <base64(username:password)>
```

日历订阅签名使用：

```http
GET /calendar/schedule.ics?studentId=2023001001&sig=<hmac_sha256(studentId, CALENDAR_SECRET)>
```

补充说明：

- 当前 `/status` 与 `/api/admin/*` 的鉴权失败由 `adminBasicAuthMiddleware` 直接返回 `401 Unauthorized` 纯文本响应，并附带 `WWW-Authenticate`
- 当前实现仍在 `src/middleware/admin-basic-auth.middleware.ts` 中硬编码管理员凭证；出于安全原因，本文档不再复述具体口令值
- 日历订阅不是 JWT，也不落库；它是固定链接，签名规则是 `HMAC_SHA256(studentId, CALENDAR_SECRET)`
- UGC 合规模式由 `/api/admin/compliance/ugc` 热更新；`normal` 模式走真实业务，`compliance` 模式让分享美食和神秘角落的 GET 读请求返回后台配置的纯文本 mock 或空分页，写操作不受影响；配置 `UGC_COMPLIANCE_ASNS` 后，命中可信 ASN 头和端口的 GET 读请求强制返回空态

## 2. 响应包结构

### 2.1 成功响应

```json
{
  "success": true,
  "data": {},
  "_meta": {
    "cached": true,
    "cache_time": "2026-03-08T10:00:00.000+08:00",
    "updated_at": "2026-03-08T10:00:00.000+08:00",
    "expires_at": "2026-03-09T10:00:00.000+08:00",
    "source": "jw",
    "stale": false
  }
}
```

说明：

- `_meta` 只出现在带缓存语义的业务接口上：`/api/schedule`、`/api/v1/schedule`、`/api/grades`、`/api/ecard`、`/api/user`
- 这些接口在回源成功时也会返回 `_meta`，此时通常为 `{ cached: false, source: ... }`
- 时间字段格式为北京时间 ISO 字符串，后缀是 `+08:00`，不是 UTC `Z`

### 2.2 `_meta` 字段定义

| 字段 | 类型 | 说明 |
|---|---|---|
| `cached` | boolean | `true` 表示本次直接命中本地缓存 |
| `cache_time` | string | 缓存创建时间 |
| `updated_at` | string | 缓存最近写入/触达时间 |
| `expires_at` | string | 缓存过期时间，当前 TTL 为 `0` 的接口通常没有该字段 |
| `source` | string | 数据源，常见值为 `jw` 或 `portal` |
| `stale` | boolean | `true` 表示回退到了旧缓存，或读取到了过期缓存 |
| `refresh_failed` | boolean | `true` 表示本次回源失败，但返回了旧缓存 |
| `last_error` | number | 导致回退的错误码，如 `3003`、`3004`、`5000` |

### 2.3 失败响应

```json
{
  "success": false,
  "error_code": 3004,
  "error_message": "学校服务器超时"
}
```

### 2.4 错误码

| 错误码 | 含义 | HTTP 状态码 |
|---|---|---:|
| `3001` | CAS 登录失败 / 登录后无法获得可用 Portal 或 JW 凭证 | 400 |
| `3002` | 验证码错误或需要验证码 | 400 |
| `3003` | 凭证过期且恢复失败，需要重新登录 | 401 |
| `3004` | 学校上游超时 | 504 |
| `4001` | JWT 无效或过期 | 401 |
| `4002` | 参数错误 | 400 |
| `4003` | 教务类强制刷新过于频繁 | 429 |
| `5000` | 服务器内部错误 | 500 或个别路由自定义状态码 |

注意：

- `/api/ecard` 和 `/api/user` 在上游返回非鉴权类异常且解析为空时，会返回 `error_code=5000`，但 HTTP 状态码是 `502`
- `/api/schedule` 与 `/api/v1/schedule` 在“课表暂未公布”时不会报错，而是返回 `200 + success=true` 的空课表对象
- `refresh=true` 回源失败且存在旧缓存时，仍可能返回 `200 + success=true`，客户端必须通过 `_meta.stale=true` 和 `_meta.refresh_failed=true` 判断这不是新鲜数据
- JW 有时会用 HTTP 200 返回登录页，例如账号在其他地方登录导致当前 JW 会话失效；服务端会把这类页面识别为凭证过期并尝试自动恢复

## 3. 当前缓存语义

这是当前代码基线下的真实行为，不是历史设计稿：

### 3.1 统一规则

- 所有 5 个业务接口都会把成功回源结果写入 `cache` 表
- `refresh=false`：先查缓存，命中直接返回
- `refresh=true`：跳过读缓存，强制回源，并覆盖写回缓存
- 回源失败时：如果同 key 还有旧缓存，会回退旧缓存并返回 `_meta.stale=true`

### 3.2 当前 TTL

| 接口 | 当前 TTL | 实际效果 |
|---|---|---|
| `GET /api/schedule` | `0` | 写入缓存，但不过期，仅 `refresh=true` 会覆盖 |
| `GET /api/v1/schedule` | `0` | 写入缓存，但不过期，仅 `refresh=true` 会覆盖 |
| `GET /api/grades` | `0` | 写入缓存，但不过期，仅 `refresh=true` 会覆盖 |
| `GET /api/ecard` | `0` | 写入缓存，但不过期，仅 `refresh=true` 会覆盖 |
| `GET /api/user` | `0` | 写入缓存，但不过期，仅 `refresh=true` 会覆盖 |

这意味着文档里如果看到“默认不缓存”或“课表 24 小时 TTL”的说法，都不是当前实现。

### 3.3 学业 `refresh` 限流

只有 `GET /api/schedule`、`GET /api/v1/schedule`、`GET /api/grades` 在 `refresh=true` 时会命中限流中间件。

- 维度：按 `userId`
- 窗口：`5` 秒
- 阈值：每窗口最多 `5` 次强制刷新请求
- 超限响应：`HTTP 429 + error_code=4003`
- 响应头：`Retry-After: <seconds>`

### 3.4 限额与淘汰

| 前缀 | 默认上限 | 说明 |
|---|---:|---|
| `grades:{studentId}:*` | 20 | 成绩缓存，按哈希 key |
| `schedule:{studentId}:*` | 120 | JW 课表 |
| `portal-schedule:{studentId}:*` | 120 | Portal 课表 |

补充说明：

- 成绩命中缓存时会 `touch`，因此更接近真实 LRU
- 两个课表接口普通命中不会 `touch`，淘汰更接近“按最后写入/刷新时间保留”
- `ecard` / `user` 当前没有前缀限额

### 3.5 日历订阅缓存语义

- `GET /calendar/schedule.ics` 固定读取“本周自然周（Asia/Shanghai，周一到周日）”
- 它内部复用门户周课表 `/api/v1/schedule` 背后的同一套服务：
  - 本周缓存存在：直接返回缓存对应的 ICS
  - 本周缓存不存在：触发一次门户周课表获取，并写回缓存
- 它不会因为缓存“旧了”而自动刷新
- 如果希望日历内容更新，需要客户端或小程序先对本周调用：
  - `GET /api/v1/schedule?startDate=<本周周一>&endDate=<本周周日>&refresh=true`
- 日历客户端会在下一次重新抓取订阅链接时看到新内容

## 4. 前端接入建议

### 4.1 登录流程

首次登录请求：

```json
{
  "username": "2023001001",
  "password": "your_password"
}
```

成功响应：

```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIs...",
    "user": {
      "name": "张三",
      "studentId": "2023001001",
      "className": "计科2301"
    }
  }
}
```

如果 CAS 要求验证码，会返回：

```json
{
  "success": false,
  "error_code": 3002,
  "error_message": "需要验证码",
  "needCaptcha": true,
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "captchaImage": "iVBORw0KGgoAAAANSUhEUg..."
}
```

前端应：

1. 展示 `captchaImage`，它是 Base64 PNG 数据
2. 收集用户输入的验证码
3. 重新调用 `POST /auth/login`
4. 复用原始 `username/password`
5. 额外带上 `captcha` 与 `sessionId`

验证码二次提交示例：

```json
{
  "username": "2023001001",
  "password": "your_password",
  "captcha": "AB12",
  "sessionId": "550e8400-e29b-41d4-a716-446655440000"
}
```

约束：

- `sessionId` 是一次性的，服务端读取后会删除
- 验证码会话保存在内存里，服务重启后全部失效
- 验证码会话 TTL 为 10 分钟
- 若用户刚在后台静默重认证里遇到“需要验证码”，后续 1 分钟内 `/auth/login` 会跳过本地快捷登录，直接进入上述 CAS/验证码流程

### 4.2 Token 处理

- 只持久化本服务 JWT
- 不要在前端保存学号密码用于“自动重登”
- 收到 `4001`：JWT 无效或过期，清空本地登录态并跳登录页
- 收到 `3003`：学校侧凭证恢复失败，也需要引导用户重新登录

### 4.3 `refresh` 的用法

- 列表页初次打开、切 tab、回前台：通常用 `refresh=false`
- 用户主动下拉刷新、点击“刷新”按钮：用 `refresh=true`
- 当前实现里 TTL 全是 `0`，因此不主动刷新的话，客户端可能长期看到旧数据

### 4.4 推荐请求封装

```ts
type ApiSuccess<T> = { success: true; data: T; _meta?: Record<string, unknown> };
type ApiFailure = { success: false; error_code: number; error_message: string };
type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

async function apiRequest<T>(path: string, token?: string): Promise<ApiResponse<T>> {
  const res = await fetch(path, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  const body = await res.json() as ApiResponse<T>;

  if (!body.success) {
    if (body.error_code === 4001 || body.error_code === 3003) {
      // 清空登录态并跳转登录页
    }
  }

  return body;
}
```

## 5. 数据模型

### 5.1 `ICourse`

`/api/schedule` 与 `/api/v1/schedule` 都返回：

```json
{
  "week": "第3周",
  "courses": [
    {
      "name": "高等数学",
      "teacher": "李教授",
      "location": "教A301",
      "day": 1,
      "section": "1-2",
      "weekStr": "1-16周"
    }
  ]
}
```

字段说明：

| 字段 | 类型 | 说明 |
|---|---|---|
| `week` | string | 当前周次或查询起始日期 |
| `courses` | array | 课程列表 |
| `courses[].name` | string | 课程名 |
| `courses[].teacher` | string | 教师 |
| `courses[].location` | string | 上课地点 |
| `courses[].day` | number | 周几，1-7 |
| `courses[].section` | string | 节次，如 `1-2` |
| `courses[].weekStr` | string | 原始时间文本 |

注意：

- 接口路径不保证最终来源，必须结合 `_meta.source` 判断真实数据源。
- `/api/schedule` 返回 `_meta.source = "portal"`、`/api/v1/schedule` 返回 `_meta.source = "jw"` 都是合法结果。
- JW 课表中的 `weekStr` 通常是周次文本，例如 `1-16周`
- Portal 课表中的 `weekStr` 当前实现存的是具体日期字符串，例如 `2026-03-08`

### 5.2 `IGradeList`

```json
{
  "summary": {
    "totalCourses": 8,
    "totalCredits": 24.0,
    "averageGpa": 3.5,
    "averageScore": 85.2
  },
  "items": [
    {
      "term": "2025-2026-1",
      "courseCode": "CS101",
      "courseName": "数据结构",
      "groupName": "计科2301",
      "score": 92,
      "scoreText": "92",
      "pass": true,
      "flag": "",
      "credit": 4.0,
      "totalHours": 64,
      "gpa": 4.0,
      "retakeTerm": "",
      "examMethod": "考试",
      "examNature": "正常考试",
      "courseAttribute": "必修",
      "courseNature": "专业核心",
      "courseCategory": "专业课"
    }
  ]
}
```

### 5.3 `IECard`

```json
{
  "balance": 128.5,
  "status": "正常",
  "lastTime": "2026-03-08 12:30:00"
}
```

### 5.4 `IUserInfo`

```json
{
  "name": "张三",
  "studentId": "2023001001",
  "className": "计科2301",
  "identity": "学生",
  "organizationCode": "12345"
}
```

### 5.5 `Announcement`

公开接口返回：

```json
{
  "id": "20260307-1",
  "title": "系统公告",
  "content": "公告内容",
  "date": "2026-03-07",
  "type": "info"
}
```

管理接口返回的公告对象会额外带上：

- `createdAt`
- `updatedAt`

`type` 固定为：`info | warning | error`

### 5.6 `DiscoverImage`

发现美食帖子中的图片对象：

```json
{
  "url": "/media/discover/2a3c6c91-7f8b-4bc7-a9d7-5c93b3e7e7f1/01.webp",
  "width": 1280,
  "height": 853,
  "sizeBytes": 184322,
  "mimeType": "image/webp"
}
```

字段说明：

| 字段 | 类型 | 说明 |
|---|---|---|
| `url` | string | 图片访问路径，当前固定挂在 `/media/discover/*` |
| `width` | number | 压缩后宽度 |
| `height` | number | 压缩后高度 |
| `sizeBytes` | number | 压缩后文件大小，单位字节 |
| `mimeType` | string | 当前实现固定为 `image/webp` |

当前实现说明：

- 服务端只保留一份压缩后的 WebP 图片
- 最长边压缩到 `1280`
- 默认质量为 `78`
- 不保留原图
- 不生成单独缩略图

### 5.7 `DiscoverPost`

发现美食帖子详情与列表项都返回同一结构：

```json
{
  "id": 12,
  "title": "今天午饭",
  "category": "其他",
  "tags": ["辣", "便宜"],
  "images": [
    {
      "url": "/media/discover/2a3c6c91-7f8b-4bc7-a9d7-5c93b3e7e7f1/01.webp",
      "width": 1280,
      "height": 853,
      "sizeBytes": 184322,
      "mimeType": "image/webp"
    }
  ],
  "coverUrl": "/media/discover/2a3c6c91-7f8b-4bc7-a9d7-5c93b3e7e7f1/01.webp",
  "imageCount": 1,
  "rating": {
    "average": 4.5,
    "count": 2,
    "total": 9,
    "userScore": 5
  },
  "author": {
    "id": 3,
    "label": "软件工程"
  },
  "isMine": false,
  "publishedAt": "2026-03-09T22:40:00.000+08:00",
  "createdAt": "2026-03-09T22:40:00.000+08:00",
  "updatedAt": "2026-03-09T22:40:00.000+08:00"
}
```

字段说明：

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | number | 帖子 ID |
| `title` | string | 一句话说明，未填写时返回空字符串 |
| `category` | string | 分类，固定枚举之一 |
| `tags` | string[] | 标签数组 |
| `images` | `DiscoverImage[]` | 图片数组 |
| `coverUrl` | string | 封面图地址，当前取第一张图 |
| `imageCount` | number | 图片数量 |
| `commentCount` | number | 评论数量（仅统计未删除评论） |
| `rating.average` | number | 平均分，保留两位小数 |
| `rating.count` | number | 评分人数 |
| `rating.total` | number | 评分总分 |
| `rating.userScore` | number \| null | 当前登录用户对该帖的评分，未评分为 `null` |
| `author.id` | number | 作者用户 ID |
| `author.label` | string | 基于用户班级字段脱敏后的展示名，例如 `软件工程` |
| `isMine` | boolean | 是否为当前登录用户本人发布 |
| `publishedAt` | string | 发布时间，北京时间 ISO 字符串 |
| `createdAt` | string | 创建时间，北京时间 ISO 字符串 |
| `updatedAt` | string | 更新时间，北京时间 ISO 字符串 |

### 5.8 `DiscoverListResponse`

发现美食列表接口统一返回：

```json
{
  "items": [],
  "page": 1,
  "pageSize": 20,
  "total": 37,
  "hasMore": true
}
```

字段说明：

| 字段 | 类型 | 说明 |
|---|---|---|
| `items` | `DiscoverPost[]` | 当前页帖子 |
| `page` | number | 当前页码，最小为 `1` |
| `pageSize` | number | 每页数量，最大为 `50` |
| `total` | number | 命中总数 |
| `hasMore` | boolean | 是否还有下一页 |

### 5.9 `DiscoverMeta`

```json
{
  "categories": ["1食堂", "2食堂", "3食堂", "5食堂", "校外", "其他"],
  "commonTags": ["好吃", "便宜", "分量足", "辣", "清淡", "排队久", "值得再吃"],
  "limits": {
    "maxImagesPerPost": 9,
    "maxTagsPerPost": 6,
    "maxTitleLength": 80,
    "maxTagLength": 12,
    "maxStoreNameLength": 32,
    "maxPriceTextLength": 20,
    "maxContentLength": 400,
    "maxCommentLength": 200
  },
  "pagination": {
    "defaultCommentPageSize": 50,
    "maxCommentPageSize": 100
  }
}
```

### 5.9.1 `DiscoverComment`

```json
{
  "id": 35,
  "postId": 12,
  "parentCommentId": 21,
  "content": "这家我也吃过，推荐加辣",
  "avatarUrl": "/media/treehole-avatar/5.webp?v=1741871670488",
  "author": {
    "id": 8,
    "label": "软件工程"
  },
  "isMine": false,
  "createdAt": "2026-03-14T12:32:00.000+08:00",
  "updatedAt": "2026-03-14T12:32:00.000+08:00"
}
```

字段说明：

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | number | 评论 ID |
| `postId` | number | 所属 discover 帖子 ID |
| `parentCommentId` | number \| null | 父评论 ID；普通评论为 `null` |
| `content` | string | 评论正文 |
| `avatarUrl` | string \| null | 评论作者树洞头像路径，`null` 时前端使用默认头像占位 |
| `author.id` | number | 评论作者用户 ID |
| `author.label` | string | 评论作者展示标签（非匿名） |
| `isMine` | boolean | 是否是当前登录用户自己的评论 |
| `createdAt` | string | 创建时间，北京时间 ISO 字符串 |
| `updatedAt` | string | 更新时间，北京时间 ISO 字符串 |

### 5.9.2 `DiscoverCommentListResponse`

```json
{
  "items": [],
  "page": 1,
  "pageSize": 50,
  "total": 12,
  "hasMore": false
}
```

字段说明：

| 字段 | 类型 | 说明 |
|---|---|---|
| `items` | `DiscoverComment[]` | 当前页评论 |
| `page` | number | 当前页码，最小为 `1` |
| `pageSize` | number | 每页数量，上限由 `discover/meta.pagination.maxCommentPageSize` 决定 |
| `total` | number | 命中总数（仅统计未删除评论） |
| `hasMore` | boolean | 是否还有下一页 |

### 5.10 `TreeholeMeta`

```json
{
  "limits": {
    "maxPostLength": 500,
    "maxCommentLength": 200
  },
  "pagination": {
    "defaultPageSize": 20,
    "maxPageSize": 50,
    "defaultCommentPageSize": 50,
    "maxCommentPageSize": 100
  }
}
```

### 5.11 `TreeholePost`

树洞列表项与详情共用同一结构：

```json
{
  "id": 18,
  "content": "今天有点累。",
  "avatarUrl": "/media/treehole-avatar/3.webp?v=1741871670488",
  "stats": {
    "likeCount": 3,
    "commentCount": 2
  },
  "viewer": {
    "liked": false,
    "isMine": true
  },
  "publishedAt": "2026-03-10T21:30:00.000+08:00",
  "createdAt": "2026-03-10T21:30:00.000+08:00",
  "updatedAt": "2026-03-10T21:30:00.000+08:00"
}
```

字段说明：

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | number | 树洞 ID |
| `content` | string | 树洞正文 |
| `avatarUrl` | string \| null | 树洞头像路径，`null` 表示使用默认匿名头像 |
| `stats.likeCount` | number | 点赞数 |
| `stats.commentCount` | number | 评论数 |
| `viewer.liked` | boolean | 当前登录用户是否已点赞 |
| `viewer.isMine` | boolean | 是否是当前登录用户自己发的 |
| `publishedAt` | string | 发布时间，北京时间 ISO 字符串 |
| `createdAt` | string | 创建时间，北京时间 ISO 字符串 |
| `updatedAt` | string | 更新时间，北京时间 ISO 字符串 |

当前实现说明：

- 返回内容默认匿名，不返回作者公开信息
- 服务端仍按 `userId` 追踪作者，用于 `isMine`、删除和“我的树洞”列表

### 5.12 `TreeholeListResponse`

```json
{
  "items": [],
  "page": 1,
  "pageSize": 20,
  "total": 8,
  "hasMore": false
}
```

字段说明：

| 字段 | 类型 | 说明 |
|---|---|---|
| `items` | `TreeholePost[]` | 当前页树洞 |
| `page` | number | 当前页码，最小为 `1` |
| `pageSize` | number | 每页数量，最大为 `50` |
| `total` | number | 命中总数 |
| `hasMore` | boolean | 是否还有下一页 |

### 5.13 `TreeholeComment`

```json
{
  "id": 6,
  "postId": 18,
  "parentCommentId": null,
  "content": "抱抱你。",
  "avatarUrl": "/media/treehole-avatar/5.webp?v=1741871670488",
  "isMine": false,
  "createdAt": "2026-03-10T21:40:00.000+08:00",
  "updatedAt": "2026-03-10T21:40:00.000+08:00"
}
```

字段说明：

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | number | 评论 ID |
| `postId` | number | 所属树洞 ID |
| `parentCommentId` | number \| null | 父评论 ID，普通评论为 `null` |
| `content` | string | 评论正文 |
| `avatarUrl` | string \| null | 评论作者头像路径，`null` 表示默认匿名头像 |
| `isMine` | boolean | 是否是当前登录用户自己的评论 |
| `createdAt` | string | 创建时间，北京时间 ISO 字符串 |
| `updatedAt` | string | 更新时间，北京时间 ISO 字符串 |

### 5.14 `TreeholeCommentListResponse`

```json
{
  "items": [],
  "page": 1,
  "pageSize": 50,
  "total": 2,
  "hasMore": false
}
```

字段说明：

| 字段 | 类型 | 说明 |
|---|---|---|
| `items` | `TreeholeComment[]` | 当前页评论 |
| `page` | number | 当前页码，最小为 `1` |
| `pageSize` | number | 每页数量，最大为 `100` |
| `total` | number | 命中总数 |
| `hasMore` | boolean | 是否还有下一页 |

### 5.15 `TreeholeAvatar`

```json
{
  "avatarUrl": "/media/treehole-avatar/3.webp?v=1741871670488"
}
```

字段说明：

| 字段 | 类型 | 说明 |
|---|---|---|
| `avatarUrl` | string \| null | 当前登录用户的树洞头像路径，`null` 表示未设置 |

### 5.16 `TreeholeUnreadNotificationCount`

```json
{
  "unreadCount": 2
}
```

### 5.17 `TreeholeReadAllNotificationsResult`

```json
{
  "readCount": 2
}
```

## 6. 接口明细

### 6.1 `GET /api/public/announcements`

无需鉴权，返回公告弹窗列表。

请求示例：

```http
GET /api/public/announcements
```

响应示例：

```json
{
  "success": true,
  "data": [
    {
      "id": "20260307-1",
      "title": "系统公告",
      "content": "公告弹窗功能已启用，请及时关注后续通知。",
      "date": "2026-03-07",
      "type": "info"
    }
  ]
}
```

### 6.2 `POST /auth/login`

CAS 统一认证登录。

必填字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| `username` | string | 学号 |
| `password` | string | 密码 |

可选字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| `captcha` | string | CAS 要求验证码时填写 |
| `sessionId` | string | 验证码二次提交时填写 |

常见错误：

| 场景 | `error_code` | HTTP |
|---|---:|---:|
| 用户名/密码为空 | 4002 | 400 |
| 请求体不是合法 JSON | 4002 | 400 |
| 需要验证码 | 3002 | 400 |
| 验证码会话不存在或过期 | 3002 | 400 |
| 用户名或密码错误 | 3001 | 400 |
| 学校超时 | 3004 | 504 |
| 教务激活失败 | 3001 | 400 |

补充说明：

- 登录成功条件不是“JW 必须激活成功”，而是 `portal_jwt` 或 `jw_session` 至少有一个可用。
- 成功响应中的 `data` 仅包含 `token` 与 `user`，不再返回额外能力字段。
- 当 Portal 可用但 JW 激活失败时，接口仍返回 `200`，属于“仅门户登录成功”。
- portal-only 登录后，Portal 课表、用户资料、一卡通等 Portal 依赖接口可继续使用；成绩等 JW 依赖接口仍取决于后续 JW 是否恢复成功。
- 当前 `3001 + 教务系统激活失败` 仍可能出现，这是历史错误文案；它实际对应的是“登录后既没有可用 Portal Token，也没有可用 JW Session”。

### 6.3 `GET /health`

无需鉴权。

成功响应：

```json
{
  "success": true,
  "data": {
    "status": "ok",
    "timestamp": "2026-03-08T12:00:00.000+08:00",
    "uptime": 1234.56
  }
}
```

当数据库不可用时返回 `503`：

```json
{
  "success": false,
  "data": {
    "status": "error"
  }
}
```

### 6.4 `GET /api/schedule`

JW 优先课表接口。

注意：路由名不等于最终数据源。若 JW 回源失败且同周 Portal 课表可用，接口会直接回退到 Portal，并在 `_meta.source` 中返回 `portal`。

查询参数：

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `date` | string | 否 | `YYYY-MM-DD`，默认取北京时间当天 |
| `refresh` | string | 否 | `true` 表示跳过读缓存并强制回源 |

正常响应：

```json
{
  "success": true,
  "data": {
    "week": "第3周",
    "courses": [
      {
        "name": "高等数学",
        "teacher": "李教授",
        "location": "教A301",
        "day": 1,
        "section": "1-2",
        "weekStr": "1-16周"
      }
    ]
  },
  "_meta": {
    "cached": true,
    "cache_time": "2026-03-08T08:00:00.000+08:00",
    "updated_at": "2026-03-08T08:00:00.000+08:00",
    "source": "jw"
  }
}
```

特殊分支：课表未公布时返回 `200`：

```json
{
  "success": true,
  "data": {
    "week": "暂无",
    "courses": [],
    "message": "课表暂未公布"
  }
}
```

常见错误：

- `4002`：`date` 格式错误或日期非法
- `3003`：JW 与回退 Portal 都无法恢复凭证
- `3004`：JW 与回退 Portal 都超时且没有旧缓存可回退

补充说明：

- JW 会话被其他登录挤掉时，上游可能返回 HTTP 200 登录页，而不是 401/302；服务端会将其识别为 `SESSION_EXPIRED`，刷新凭证后重试
- 如果自动恢复仍失败且没有 Portal/旧缓存可回退，接口返回 `3003`
- 如果有旧缓存可回退，接口返回 `200`，并在 `_meta.last_error` 中暴露本次失败原因

### 6.5 `GET /api/v1/schedule`

Portal 优先课表接口。虽然路径名带 `v1`，但当前语义是“统一门户源课表”。

查询参数：

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `startDate` | string | 是 | `YYYY-MM-DD` |
| `endDate` | string | 是 | `YYYY-MM-DD` |
| `refresh` | string | 否 | `true` 表示跳过读缓存并强制回源 |

约束：

- `endDate` 不能早于 `startDate`
- 日期区间不能超过 62 天
- 只有当请求范围正好是“周一到周日”的 7 天整周时，Portal 失败才会回退 JW；其他区间不会回退

返回结构与 `/api/schedule` 相同，也是 `{ week, courses }`，不是按日期分组的对象：

```json
{
  "success": true,
  "data": {
    "week": "2026-03-01",
    "courses": [
      {
        "name": "大学英语",
        "teacher": "王老师",
        "location": "教B201",
        "day": 2,
        "section": "3-4",
        "weekStr": "2026-03-03"
      }
    ]
  },
  "_meta": {
    "cached": false,
    "source": "portal"
  }
}
```

“课表暂未公布”时同样返回 `200 + success=true` 的空课表对象。

若发生周视图回退，返回体结构不变，但 `_meta.source` 会变为 `jw`。

### 6.5.1 `GET /api/calendar/link`

为当前登录用户生成固定的日历订阅链接。

认证方式：

- `Authorization: Bearer <token>`

成功响应：

```json
{
  "success": true,
  "data": {
    "url": "https://example.com/calendar/schedule.ics?studentId=2023001001&sig=abcdef...",
    "studentId": "2023001001",
    "sig": "abcdef..."
  }
}
```

说明：

- 返回的是固定链接，同一 `studentId` 在 `CALENDAR_SECRET` 不变的前提下会得到相同签名
- 当前实现只认 `CALENDAR_BASE_URL`，不会根据请求 `Host` 动态拼域名
- 如果 `CALENDAR_BASE_URL` 或 `CALENDAR_SECRET` 未配置，会返回 `5000`

### 6.5.2 `GET /calendar/schedule.ics`

返回当前用户“本周自然周”的课程订阅 ICS。

查询参数：

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `studentId` | string | 是 | 学号 |
| `sig` | string | 是 | `HMAC_SHA256(studentId, CALENDAR_SECRET)` 的十六进制小写签名 |

返回头：

```http
Content-Type: text/calendar; charset=utf-8
Content-Disposition: inline; filename="schedule.ics"
Cache-Control: no-store
```

成功响应体为 ICS 文本，例如：

```ics
BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//HUAS Server//Schedule Calendar//CN
BEGIN:VEVENT
SUMMARY:大学英语
DTSTART;TZID=Asia/Shanghai:20260414T080000
DTEND;TZID=Asia/Shanghai:20260414T094000
LOCATION:教B201
END:VEVENT
END:VCALENDAR
```

补充说明：

- 只读取本周自然周，不包含下周或历史周
- 节次时间由服务端本地静态映射转换为具体时分
- 若签名错误，返回 `4001/401`
- 若用户不存在，返回 `4001/401`
- 若课表暂未公布，返回空日历而不是 JSON 错误
- 若本周缓存不存在，会触发一次门户周课表获取并写回缓存
- 若本周缓存已存在，则不会自动回源刷新；刷新应由 `/api/v1/schedule?...&refresh=true` 驱动
- 日历订阅复用的是 `PortalScheduleService` 与 Portal 周粒度缓存，不经过 `/api/v1/schedule` 路由层的 JW fallback；不要把它理解成“和 `/api/v1/schedule` 完全同语义”

### 6.6 `GET /api/grades`

成绩查询。

查询参数：

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `term` | string | 否 | 学期，最长 32 字符 |
| `kcxz` | string | 否 | 课程性质，最长 32 字符 |
| `kcmc` | string | 否 | 课程名搜索，最长 64 字符 |
| `refresh` | string | 否 | `true` 表示跳过读缓存并强制回源 |

响应示例：

```json
{
  "success": true,
  "data": {
    "summary": {
      "totalCourses": 8,
      "totalCredits": 24,
      "averageGpa": 3.5,
      "averageScore": 85.2
    },
    "items": []
  },
  "_meta": {
    "cached": false,
    "source": "jw"
  }
}
```

补充说明：

- 缓存 key 不是原始查询串，而是 `grades:{studentId}:{sha256摘要前32位}`
- 超长参数会直接返回 `4002`
- 当前实现默认会缓存，且不过期，只有 `refresh=true` 才强制更新

### 6.7 `GET /api/ecard`

一卡通余额信息。

查询参数：

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `refresh` | string | 否 | `true` 表示跳过读缓存并强制回源 |

成功响应：

```json
{
  "success": true,
  "data": {
    "balance": 128.5,
    "status": "正常",
    "lastTime": "2026-03-08 12:30:00"
  },
  "_meta": {
    "cached": true,
    "cache_time": "2026-03-08T12:00:00.000+08:00",
    "updated_at": "2026-03-08T12:00:00.000+08:00",
    "source": "portal"
  }
}
```

失败分支：

- 若上游鉴权失效并恢复失败，返回 `3003`
- 若上游返回非鉴权类错误且没有可用数据，返回 `502 + error_code=5000`

### 6.8 `GET /api/user`

用户资料。

查询参数：

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `refresh` | string | 否 | `true` 表示跳过读缓存并强制回源 |

成功响应：

```json
{
  "success": true,
  "data": {
    "name": "张三",
    "studentId": "2023001001",
    "className": "计科2301",
    "identity": "学生",
    "organizationCode": "12345"
  },
  "_meta": {
    "cached": false,
    "source": "portal"
  }
}
```

补充说明：

- `/auth/login` 成功后，如果已拿到 `portalToken` 且本地用户资料缺失，会尝试主动调用一次 `/api/user` 的同源逻辑回填姓名和班级
- `/api/user` 成功时也会把 `name/className` 回写到 `users` 表

### 6.9 `GET /api/admin/dashboard`

管理员仪表盘数据。

查询参数：

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `page` | string | 否 | 分页页码，默认 `1` |
| `search` | string | 否 | 学号或姓名模糊搜索 |
| `major` | string | 否 | 班级筛选；未分配使用 `__UNASSIGNED__` |
| `grade` | string | 否 | 按学号中解析出的 4 位年级筛选 |

响应结构：

```json
{
  "success": true,
  "data": {
    "service": {
      "status": "ok",
      "timestamp": "2026-03-08T12:00:00.000+08:00"
    },
    "metrics": {
      "totalUsers": 100,
      "todayActiveUsers": 20,
      "activeUsers7d": 60,
      "newUsers7d": 10,
      "cacheEntries": 300,
      "credentialEntries": 180,
      "totalDiscoverPosts": 12,
      "totalDiscoverRatings": 38,
      "memory": {
        "rssMb": 52.13,
        "heapUsedMb": 18.41,
        "heapTotalMb": 28.17
      },
      "uptimeSeconds": 12345
    },
    "distributions": {
      "byMajor": [],
      "byGrade": []
    },
    "users": {
      "page": 1,
      "pageSize": 20,
      "total": 100,
      "totalPages": 5,
      "filters": {
        "search": "",
        "major": "",
        "grade": ""
      },
      "options": {
        "majors": [],
        "grades": []
      },
        "items": []
      },
      "discover": {
        "totalPosts": 12,
        "totalRatings": 38,
        "items": [
          {
            "id": 12,
            "title": "今天午饭",
            "category": "其他",
            "coverUrl": "/media/discover/2a3c6c91-7f8b-4bc7-a9d7-5c93b3e7e7f1/01.webp",
            "images": [
              {
                "url": "/media/discover/2a3c6c91-7f8b-4bc7-a9d7-5c93b3e7e7f1/01.webp",
                "width": 1280,
                "height": 853,
                "sizeBytes": 184322,
                "mimeType": "image/webp"
              }
            ],
            "imageCount": 2,
            "ratingAverage": 4.5,
            "ratingCount": 2,
            "authorLabel": "软件工程",
            "publishedAt": "2026-03-10T10:20:00.000+08:00"
          }
        ]
      },
      "logs": {
        "limit": 50,
        "keyword": "",
        "items": []
      },
      "announcements": []
    }
  }
}
```

补充说明：

- `logs.items[].source` 取值为 `out | error`
- 日志来源是本地文件 `logs/pm2-out.log` 与 `logs/pm2-error.log`
- `grade` 不是简单取学号前四位，而是从学号中匹配第一个合法年份，例如 `S202307020119 -> 2023`
- `discover` 段用于管理员页面展示最近的发现美食帖子，并提供删除入口
- `discover.items[].coverUrl` 和 `discover.items[].images` 用于管理员页面点击后查看图片
- 当前管理页上的公告增删改、管理员删帖、用户发帖/评分/删帖都会写入终端日志，因此刷新 dashboard 时能在日志表里看到最近操作

### 6.9.1 `GET/PUT /api/admin/compliance/ugc`

后台热控制 UGC 正常/合规模式，需 HTTP Basic Auth。

`GET` 返回当前状态：

```json
{
  "success": true,
  "data": {
    "mode": "normal",
    "disabled": false,
    "discoverMockText": "",
    "treeholeMockText": "",
    "updatedAt": "2026-07-01T12:00:00.000+08:00",
    "updatedBy": "admin",
    "stateFile": "./data/ugc-compliance-state.json"
  }
}
```

`PUT` 请求体：

```json
{
  "mode": "compliance",
  "discoverMockText": "",
  "treeholeMockText": ""
}
```

字段说明：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `mode` | string | 是 | `normal` 走真实业务；`compliance` 返回虚拟 mock |
| `discoverMockText` | string | 否 | 分享美食纯文本 mock，默认空字符串 |
| `treeholeMockText` | string | 否 | 神秘角落纯文本 mock，默认空字符串 |

补充说明：

- 两个 mock 字段只保存纯文本；服务端会移除尖括号和控制字符，并截断到 400 字符
- `compliance` 模式下，分享美食和神秘角落的 GET 读请求（`/meta` 除外）仍需 Bearer JWT
- mock 为空时列表和评论返回空分页；mock 非空时对应模块公共列表第 1 页返回一条虚拟内容
- 前端不读取合规模式 meta；当公共列表返回空分页、空数组、空对象或 id=0 mock 时，应收敛反馈入口与内容展示
- 写操作（发帖、评论、评分、点赞、删除、头像上传等）不受该模式影响
- 状态写入 `UGC_COMPLIANCE_STATE_FILE`，默认 `./data/ugc-compliance-state.json`，用于多进程热传播和重启后延续
- `UGC_COMPLIANCE_ASNS` 可配置逗号/空格分隔 ASN；`UGC_COMPLIANCE_PORTS` 可限制入口端口，空值表示不限端口
- ASN 自动空态依赖可信反代写入 `UGC_COMPLIANCE_ASN_HEADER`（默认 `x-client-asn`）与 `UGC_COMPLIANCE_PORT_HEADER`（默认 `x-forwarded-port`），命中时忽略后台 mock 文案并返回空数据

### 6.9.2 `GET /api/admin/logs`

读取最新终端日志，需 HTTP Basic Auth。

查询参数：

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|---|---|---|---|---|
| `limit` | string | 否 | `50` | 返回条数，上限 `200` |
| `keyword` | string | 否 | 空字符串 | 按关键字过滤日志行 |

响应结构：

```json
{
  "success": true,
  "data": {
    "limit": 50,
    "keyword": "discover",
    "items": [
      {
        "source": "out",
        "line": "2026-03-14 10:20:00 [OPS] Discover 发布帖子 #12"
      },
      {
        "source": "error",
        "line": "2026-03-14 10:21:00 [ERR] Cleanup 定时清理失败"
      }
    ]
  }
}
```

补充说明：

- `items[].source` 只会是 `out | error`
- 读取来源固定为 `logs/pm2-out.log` 与 `logs/pm2-error.log`
- Basic Auth 失败时返回 `401 Unauthorized` 纯文本，不走 JSON 错误包

### 6.9.3 `GET /api/admin/treehole/posts`

管理员查看树洞列表，需 HTTP Basic Auth。

查询参数：

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|---|---|---|---|---|
| `page` | string | 否 | `1` | 页码 |
| `pageSize` | string | 否 | `20` | 每页数量，上限 `50` |
| `keyword` | string | 否 | 空字符串 | 按内容、学号、姓名、班级模糊搜索 |

响应结构：

```json
{
  "success": true,
  "data": {
    "summary": {
      "totalPosts": 18,
      "totalComments": 42,
      "totalLikes": 97
    },
    "items": [
      {
        "id": 18,
        "content": "今天食堂排队离谱",
        "stats": {
          "likeCount": 5,
          "commentCount": 2
        },
        "author": {
          "id": 3,
          "studentId": "2023001001",
          "name": "张三",
          "className": "计科2301"
        },
        "publishedAt": "2026-03-14T10:20:00.000+08:00",
        "createdAt": "2026-03-14T10:20:00.000+08:00",
        "updatedAt": "2026-03-14T10:20:00.000+08:00"
      }
    ],
    "page": 1,
    "pageSize": 20,
    "total": 18,
    "hasMore": false
  }
}
```

补充说明：

- `summary` 统计的是当前全量未删除树洞、评论、点赞总数，不受 `keyword` 过滤影响
- `author` 是管理员可见的实名作者信息，不是匿名展示字段
- Basic Auth 失败时返回 `401 Unauthorized` 纯文本，不走 JSON 错误包

### 6.9.4 `GET /api/admin/treehole/posts/:id/comments`

管理员查看某条树洞的评论列表，需 HTTP Basic Auth。

查询参数：

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|---|---|---|---|---|
| `page` | string | 否 | `1` | 页码 |
| `pageSize` | string | 否 | `50` | 每页数量，上限 `100` |

响应结构：

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": 6,
        "postId": 18,
        "content": "我也遇到了",
        "author": {
          "id": 5,
          "studentId": "2023001005",
          "name": "李四",
          "className": "软件工程2301"
        },
        "createdAt": "2026-03-14T10:30:00.000+08:00",
        "updatedAt": "2026-03-14T10:30:00.000+08:00"
      }
    ],
    "page": 1,
    "pageSize": 50,
    "total": 1,
    "hasMore": false
  }
}
```

补充说明：

- 只返回未删除评论
- 目标帖子不存在或已删除时，返回 `404 + error_code=4002`
- Basic Auth 失败时返回 `401 Unauthorized` 纯文本，不走 JSON 错误包

### 6.10 `GET /api/admin/announcements`

返回公告完整列表，需 Basic Auth。

响应中的每条公告都包含：

- `id`
- `title`
- `content`
- `date`
- `type`
- `createdAt`
- `updatedAt`

### 6.11 `POST /api/admin/announcements`

新增公告，需 Basic Auth。

请求体：

```json
{
  "title": "系统公告",
  "content": "公告内容",
  "date": "2026-03-08",
  "type": "info"
}
```

规则：

- `title` 必填
- `content` 必填
- `type` 必填，只允许 `info | warning | error`
- `date` 可省略，省略时默认取北京时间当天
- `id` 由服务端自动生成，格式为 `YYYYMMDD-N`

### 6.12 `PUT /api/admin/announcements/:id`

更新公告，需 Basic Auth，支持部分字段更新。

示例：

```json
{
  "title": "更新后的标题",
  "content": "更新后的内容"
}
```

规则：

- 未传字段保持原值
- `date` 若传入，必须是 `YYYY-MM-DD`
- 目标公告不存在时返回 `404 + error_code=4002`

### 6.13 `DELETE /api/admin/announcements/:id`

删除公告，需 Basic Auth。

成功响应：

```json
{
  "success": true,
  "data": {
    "id": "20260308-1"
  }
}
```

### 6.14 `GET /api/discover/meta`

发现美食元信息接口，需 Bearer JWT。

用途：

- 获取前端分类枚举
- 获取推荐常用标签
- 获取发帖与评论限制、评论分页配置

请求示例：

```http
GET /api/discover/meta
Authorization: Bearer <token>
```

响应示例：

```json
{
  "success": true,
  "data": {
    "categories": ["1食堂", "2食堂", "3食堂", "5食堂", "校外", "其他"],
    "commonTags": ["好吃", "便宜", "分量足", "辣", "清淡", "排队久", "值得再吃"],
    "limits": {
      "maxImagesPerPost": 9,
      "maxTagsPerPost": 6,
      "maxTitleLength": 80,
      "maxTagLength": 12,
      "maxStoreNameLength": 32,
      "maxPriceTextLength": 20,
      "maxContentLength": 400,
      "maxCommentLength": 200
    },
    "pagination": {
      "defaultCommentPageSize": 50,
      "maxCommentPageSize": 100
    }
  }
}
```

### 6.15 `POST /api/discover/posts`

创建并直接发布帖子，需 Bearer JWT。

请求体必须是 `multipart/form-data`。

字段定义：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `category` | string | 是 | 分类，必须为 `1食堂 / 2食堂 / 3食堂 / 5食堂 / 校外 / 其他` 之一 |
| `title` | string | 否 | 一句话说明，最长 `80` 个字 |
| `tags` / `tags[]` | string | 是 | 标签；支持重复字段、逗号分隔、换行分隔，或单个 JSON 数组字符串 |
| `images` / `images[]` | File | 是 | 图片文件；至少 `1` 张，最多 `9` 张 |

标签解析说明：

- `tags=辣`
- `tags=便宜`
- `tags=辣,便宜`
- `tags=["辣","便宜"]`

以上几种写法都能被后端接受。

图片规则：

- 单张原图最大 `32 MB`，由 `DISCOVER_IMAGE_MAX_BYTES` 控制
- 支持 JPG、PNG、WebP、GIF、HEIC、HEIF、AVIF、TIFF 等主流手机图片格式
- 上传后只保存压缩后的单份 WebP，默认最长边 `1280`、质量 `78`

请求示例：

```http
POST /api/discover/posts
Authorization: Bearer <token>
Content-Type: multipart/form-data
```

表单示例：

| 字段 | 值 |
|---|---|
| `category` | `其他` |
| `title` | `今天午饭` |
| `tags` | `辣` |
| `tags` | `便宜` |
| `images` | `food-a.jpg` |
| `images` | `food-b.jpg` |

成功响应：

```json
{
  "success": true,
  "data": {
    "id": 12,
    "title": "今天午饭",
    "category": "其他",
    "tags": ["辣", "便宜"],
    "images": [
      {
        "url": "/media/discover/2a3c6c91-7f8b-4bc7-a9d7-5c93b3e7e7f1/01.webp",
        "width": 1280,
        "height": 853,
        "sizeBytes": 184322,
        "mimeType": "image/webp"
      }
    ],
    "coverUrl": "/media/discover/2a3c6c91-7f8b-4bc7-a9d7-5c93b3e7e7f1/01.webp",
    "imageCount": 1,
    "rating": {
      "average": 0,
      "count": 0,
      "total": 0,
      "userScore": null
    },
    "author": {
      "id": 1,
      "label": "软件工程"
    },
    "isMine": true,
    "publishedAt": "2026-03-09T22:40:00.000+08:00",
    "createdAt": "2026-03-09T22:40:00.000+08:00",
    "updatedAt": "2026-03-09T22:40:00.000+08:00"
  }
}
```

常见错误：

| 场景 | `error_code` | HTTP |
|---|---:|---:|
| 未携带 Bearer Token | 4001 | 401 |
| 请求不是 `multipart/form-data` | 4002 | 400 |
| 分类为空或不合法 | 4002 | 400 |
| 未上传图片 | 4002 | 400 |
| 图片超过 9 张 | 4002 | 400 |
| 单图超过 8MB | 4002 | 400 |
| 标签为空 | 4002 | 400 |
| 标签数量超过 6 个 | 4002 | 400 |
| 标签或标题超长 | 4002 | 400 |
| 图片处理失败 | 4002 | 400 |

### 6.16 `GET /api/discover/posts`

获取公共帖子列表，需 Bearer JWT。

查询参数：

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|---|---|---|---|---|
| `sort` | string | 否 | `latest` | 排序方式，只允许 `latest / score / recommended` |
| `category` | string | 否 | - | 分类过滤 |
| `page` | number | 否 | `1` | 页码，非法值会回退到 `1` |
| `pageSize` | number | 否 | `20` | 每页数量，最大 `50` |

`sort` 语义：

- `latest`：按 `publishedAt DESC, id DESC`
- `score`：按 `ratingAvg DESC, publishedAt DESC, id DESC`
- `recommended`：按“用户历史评分偏好”召回

`recommended` 的当前实现：

1. 读取当前用户所有评分记录
2. 对每条评分计算偏好权重 `max(score - 2, 0)`
3. 汇总高分帖子中的分类权重和标签权重
4. 从未删除、非本人发布的帖子中召回候选
5. 过滤掉当前用户已经评分过的帖子
6. 以 `匹配分 -> 平均分 -> 发布时间` 排序
7. 如果用户还没有有效偏好，或没有召回结果，则自动回退到 `latest`
8. 回退后的结果仍然会排除用户自己发布的帖子，以及用户已经评分过的帖子

请求示例：

```http
GET /api/discover/posts?sort=score&category=1%E9%A3%9F%E5%A0%82&page=1&pageSize=10
Authorization: Bearer <token>
```

成功响应：

```json
{
  "success": true,
  "data": {
    "items": [],
    "page": 1,
    "pageSize": 10,
    "total": 0,
    "hasMore": false
  }
}
```

注意：

- 只返回未删除帖子
- 列表中的 `rating.userScore` 会反映当前登录用户自己的评分
- `recommended` 不是热门榜，不使用浏览量、点赞量等行为数据

### 6.17 `GET /api/discover/posts/me`

获取“我的帖子”列表，需 Bearer JWT。

查询参数与公共列表一致：

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|---|---|---|---|---|
| `category` | string | 否 | - | 分类过滤 |
| `page` | number | 否 | `1` | 页码 |
| `pageSize` | number | 否 | `20` | 每页数量，最大 `50` |

当前实现说明：

- 只返回当前用户自己发布且未删除的帖子
- 按 `publishedAt DESC, id DESC` 排序
- 不支持查看已删除帖子

请求示例：

```http
GET /api/discover/posts/me?page=1&pageSize=20
Authorization: Bearer <token>
```

响应结构与 [5.8 `DiscoverListResponse`](#58-discoverlistresponse) 相同。

### 6.18 `GET /api/discover/posts/:id`

获取帖子详情，需 Bearer JWT。

请求示例：

```http
GET /api/discover/posts/12
Authorization: Bearer <token>
```

成功时返回 [5.7 `DiscoverPost`](#57-discoverpost)。

错误：

| 场景 | `error_code` | HTTP |
|---|---:|---:|
| 帖子 ID 非正整数 | 4002 | 400 |
| 帖子不存在或已删除 | 4002 | 404 |

### 6.19 `POST /api/discover/posts/:id/rating`

给帖子评分，需 Bearer JWT。

请求体：

```json
{
  "score": 5
}
```

规则：

- `score` 必须是 `1-5` 的整数
- 同一用户对同一帖子只能保留一条评分
- 重复评分会覆盖旧值
- 作者不能给自己的帖子评分
- 帖子不存在或已删除时不能评分

请求示例：

```http
POST /api/discover/posts/12/rating
Authorization: Bearer <token>
Content-Type: application/json
```

成功响应：

返回更新后的 [5.7 `DiscoverPost`](#57-discoverpost)。

错误：

| 场景 | `error_code` | HTTP |
|---|---:|---:|
| 请求体不是合法 JSON | 4002 | 400 |
| 帖子 ID 非法 | 4002 | 400 |
| `score` 不是 1-5 整数 | 4002 | 400 |
| 给自己的帖子评分 | 4002 | 400 |
| 帖子不存在或已删除 | 4002 | 404 |

### 6.20 `DELETE /api/discover/posts/:id`

删除自己的帖子，需 Bearer JWT。

行为：

- 只允许作者删除自己的帖子
- 删除后帖子会从公共列表、推荐列表、详情页消失
- 删除后对应图片目录会被清理

请求示例：

```http
DELETE /api/discover/posts/12
Authorization: Bearer <token>
```

成功响应：

```json
{
  "success": true,
  "data": {
    "id": 12
  }
}
```

错误：

| 场景 | `error_code` | HTTP |
|---|---:|---:|
| 帖子 ID 非法 | 4002 | 400 |
| 帖子不存在、已删除或无权删除 | 4002 | 404 |

### 6.20.1 `GET /api/discover/posts/:id/comments`

获取帖子评论列表，需 Bearer JWT。

查询参数：

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|---|---|---|---|---|
| `page` | number | 否 | `1` | 页码，最小为 `1` |
| `pageSize` | number | 否 | `discover.meta.pagination.defaultCommentPageSize` | 每页数量，上限为 `discover.meta.pagination.maxCommentPageSize` |

规则：

- 仅返回当前帖子下 `deleted_at IS NULL` 的评论
- 返回顺序为 `createdAt ASC, id ASC`
- 帖子不存在或已删除时返回 `404`

请求示例：

```http
GET /api/discover/posts/12/comments?page=1&pageSize=50
Authorization: Bearer <token>
```

成功响应：

返回 [5.9.2 `DiscoverCommentListResponse`](#592-discovercommentlistresponse)。

错误：

| 场景 | `error_code` | HTTP |
|---|---:|---:|
| 帖子 ID 非法 | 4002 | 400 |
| 帖子不存在或已删除 | 4002 | 404 |

### 6.20.2 `POST /api/discover/posts/:id/comments`

创建帖子评论或回复，需 Bearer JWT。

请求体：

```json
{
  "content": "推荐加辣",
  "parentCommentId": 21
}
```

字段说明：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `content` | string | 是 | 评论正文，不能为空，最大长度由 `discover/meta.limits.maxCommentLength` 决定 |
| `parentCommentId` | number \| null | 否 | 回复目标；必须是“同帖且未删除”的评论 |

规则：

- 帖子不存在或已删除时返回 `404`
- `parentCommentId` 非法、跨帖或目标已删除时返回 `400`
- 创建成功后会刷新帖子 `commentCount`

请求示例：

```http
POST /api/discover/posts/12/comments
Authorization: Bearer <token>
Content-Type: application/json
```

成功响应：

返回 [5.9.1 `DiscoverComment`](#591-discovercomment)。

错误：

| 场景 | `error_code` | HTTP |
|---|---:|---:|
| 帖子 ID 非法 | 4002 | 400 |
| 请求体不是合法 JSON | 4002 | 400 |
| 评论内容为空或超长 | 4002 | 400 |
| 父评论 ID 非法 | 4002 | 400 |
| 回复的评论不存在（含跨帖/已删除） | 4002 | 400 |
| 帖子不存在或已删除 | 4002 | 404 |

### 6.20.3 `DELETE /api/discover/comments/:id`

删除自己的评论，需 Bearer JWT。

规则：

- 仅允许评论作者本人删除
- 帖子不存在或已删除时，删除评论也返回 `404`
- 删除成功后会刷新帖子 `commentCount`

请求示例：

```http
DELETE /api/discover/comments/35
Authorization: Bearer <token>
```

成功响应：

```json
{
  "success": true,
  "data": {
    "id": 35,
    "postId": 12
  }
}
```

错误：

| 场景 | `error_code` | HTTP |
|---|---:|---:|
| 评论 ID 非法 | 4002 | 400 |
| 评论不存在、已删除、无权删除，或所属帖子已删除 | 4002 | 404 |

### 6.21 `DELETE /api/admin/discover/posts/:id`

管理员删除帖子，需 HTTP Basic Auth。

请求示例：

```http
DELETE /api/admin/discover/posts/12
Authorization: Basic <base64(username:password)>
```

成功响应：

```json
{
  "success": true,
  "data": {
    "id": 12
  }
}
```

错误：

| 场景 | `error_code` | HTTP |
|---|---:|---:|
| 帖子 ID 非法 | 4002 | 400 |
| 帖子不存在 | 4002 | 404 |
| 删除过程中出现未处理异常 | 5000 | 500 |

鉴权失败补充：

- Basic Auth 缺失或错误时，直接返回 `401 Unauthorized` 纯文本，并附 `WWW-Authenticate`

### 6.22 `GET /media/discover/:storageKey/:fileName`

访问发现美食图片，无需鉴权。

请求示例：

```http
GET /media/discover/2a3c6c91-7f8b-4bc7-a9d7-5c93b3e7e7f1/01.webp
```

当前实现规则：

- 只有“仍然存在且未删除”的帖子图片可访问
- 图片文件不存在时返回 `404`
- 已删除帖子的图片访问会返回 `404`
- 响应头会带：

```http
Cache-Control: public, max-age=31536000, immutable
```

注意：

- 这是静态媒体访问地址，不是 API JSON 接口
- 前端应直接把 `DiscoverImage.url` 用作 `img`/`Image` 组件地址
- 删除帖子后，旧图片 URL 不再可用
- Discover 图片 URL 基于 `storageKey + fileName`，生成后不覆盖，适合长期缓存

### 6.23 `GET /api/treehole/meta`

获取树洞元信息，需 Bearer JWT。

请求示例：

```http
GET /api/treehole/meta
Authorization: Bearer <token>
```

成功响应：

返回 [5.10 `TreeholeMeta`](#510-treeholemeta)。

### 6.24 `GET /api/treehole/posts`

获取树洞公共列表，需 Bearer JWT。

查询参数：

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|---|---|---|---|---|
| `page` | number | 否 | `1` | 页码 |
| `pageSize` | number | 否 | `20` | 每页数量，最大 `50` |

当前实现说明：

- 只返回未删除树洞
- 按 `publishedAt DESC, id DESC` 排序
- 返回结果中会带当前登录用户的 `viewer.isMine` 与 `viewer.liked`

请求示例：

```http
GET /api/treehole/posts?page=1&pageSize=20
Authorization: Bearer <token>
```

成功响应：

返回 [5.12 `TreeholeListResponse`](#512-treeholelistresponse)。

错误：

| 场景 | `error_code` | HTTP |
|---|---:|---:|
| 分页参数不合法 | 4002 | 400 |

### 6.25 `GET /api/treehole/posts/me`

获取“我的树洞”列表，需 Bearer JWT。

查询参数与公共列表一致：

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|---|---|---|---|---|
| `page` | number | 否 | `1` | 页码 |
| `pageSize` | number | 否 | `20` | 每页数量，最大 `50` |

当前实现说明：

- 只返回当前用户自己发布且未删除的树洞
- 按 `publishedAt DESC, id DESC` 排序

请求示例：

```http
GET /api/treehole/posts/me?page=1&pageSize=20
Authorization: Bearer <token>
```

成功响应：

返回 [5.12 `TreeholeListResponse`](#512-treeholelistresponse)。

错误：

| 场景 | `error_code` | HTTP |
|---|---:|---:|
| 分页参数不合法 | 4002 | 400 |

### 6.26 `POST /api/treehole/posts`

发布树洞，需 Bearer JWT。

请求体：

```json
{
  "content": "今天有点累。"
}
```

规则：

- 请求体必须是合法 JSON
- `content.trim()` 不能为空
- 内容长度不能超过 `500` 字

请求示例：

```http
POST /api/treehole/posts
Authorization: Bearer <token>
Content-Type: application/json
```

成功响应：

返回新建后的 [5.11 `TreeholePost`](#511-treeholepost)。

错误：

| 场景 | `error_code` | HTTP |
|---|---:|---:|
| 请求体不是合法 JSON | 4002 | 400 |
| 内容为空或超长 | 4002 | 400 |

### 6.27 `GET /api/treehole/posts/:id`

获取树洞详情，需 Bearer JWT。

请求示例：

```http
GET /api/treehole/posts/18
Authorization: Bearer <token>
```

成功响应：

返回 [5.11 `TreeholePost`](#511-treeholepost)。

错误：

| 场景 | `error_code` | HTTP |
|---|---:|---:|
| 帖子 ID 非法 | 4002 | 400 |
| 树洞不存在或已删除 | 4002 | 404 |

### 6.28 `PUT /api/treehole/posts/:id/like`

点赞树洞，需 Bearer JWT。

规则：

- 同一用户对同一树洞只保留一条点赞记录
- 重复点赞是幂等的

请求示例：

```http
PUT /api/treehole/posts/18/like
Authorization: Bearer <token>
```

成功响应：

返回更新后的 [5.11 `TreeholePost`](#511-treeholepost)。

错误：

| 场景 | `error_code` | HTTP |
|---|---:|---:|
| 帖子 ID 非法 | 4002 | 400 |
| 树洞不存在或已删除 | 4002 | 404 |

### 6.29 `DELETE /api/treehole/posts/:id/like`

取消点赞树洞，需 Bearer JWT。

规则：

- 重复取消点赞是幂等的

请求示例：

```http
DELETE /api/treehole/posts/18/like
Authorization: Bearer <token>
```

成功响应：

返回更新后的 [5.11 `TreeholePost`](#511-treeholepost)。

错误：

| 场景 | `error_code` | HTTP |
|---|---:|---:|
| 帖子 ID 非法 | 4002 | 400 |
| 树洞不存在或已删除 | 4002 | 404 |

### 6.30 `GET /api/treehole/posts/:id/comments`

获取树洞评论列表，需 Bearer JWT。

查询参数：

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|---|---|---|---|---|
| `page` | number | 否 | `1` | 页码 |
| `pageSize` | number | 否 | `50` | 每页数量，最大 `100` |

当前实现说明：

- 只返回未删除评论
- 按 `createdAt ASC, id ASC` 排序

请求示例：

```http
GET /api/treehole/posts/18/comments?page=1&pageSize=50
Authorization: Bearer <token>
```

成功响应：

返回 [5.14 `TreeholeCommentListResponse`](#514-treeholecommentlistresponse)。

错误：

| 场景 | `error_code` | HTTP |
|---|---:|---:|
| 帖子 ID 非法 | 4002 | 400 |
| 分页参数不合法 | 4002 | 400 |
| 树洞不存在或已删除 | 4002 | 404 |

### 6.31 `POST /api/treehole/posts/:id/comments`

发布树洞评论，需 Bearer JWT。

请求体：

```json
{
  "content": "抱抱你。",
  "parentCommentId": 5
}
```

规则：

- 请求体必须是合法 JSON
- `content.trim()` 不能为空
- 内容长度不能超过 `200` 字
- `parentCommentId` 可选；传入时必须是正整数

请求示例：

```http
POST /api/treehole/posts/18/comments
Authorization: Bearer <token>
Content-Type: application/json
```

成功响应：

返回 [5.13 `TreeholeComment`](#513-treeholecomment)。

错误：

| 场景 | `error_code` | HTTP |
|---|---:|---:|
| 帖子 ID 非法 | 4002 | 400 |
| 请求体不是合法 JSON | 4002 | 400 |
| 评论内容为空或超长 | 4002 | 400 |
| 父评论 ID 非法或父评论不属于该帖子 | 4002 | 400 |
| 树洞不存在或已删除 | 4002 | 404 |

### 6.32 `DELETE /api/treehole/posts/:id`

删除自己的树洞，需 Bearer JWT。

行为：

- 只允许作者删除自己的树洞
- 删除后公共列表、我的树洞列表、详情和评论列表都不可再访问

请求示例：

```http
DELETE /api/treehole/posts/18
Authorization: Bearer <token>
```

成功响应：

```json
{
  "success": true,
  "data": {
    "id": 18
  }
}
```

错误：

| 场景 | `error_code` | HTTP |
|---|---:|---:|
| 帖子 ID 非法 | 4002 | 400 |
| 树洞不存在、已删除或无权删除 | 4002 | 404 |

### 6.33 `DELETE /api/treehole/comments/:id`

删除自己的评论，需 Bearer JWT。

请求示例：

```http
DELETE /api/treehole/comments/6
Authorization: Bearer <token>
```

成功响应：

```json
{
  "success": true,
  "data": {
    "id": 6,
    "postId": 18
  }
}
```

错误：

| 场景 | `error_code` | HTTP |
|---|---:|---:|
| 评论 ID 非法 | 4002 | 400 |
| 评论不存在、已删除或无权删除 | 4002 | 404 |

### 6.34 `DELETE /api/admin/treehole/posts/:id`

管理员删除树洞，需 HTTP Basic Auth。

请求示例：

```http
DELETE /api/admin/treehole/posts/18
Authorization: Basic <base64(username:password)>
```

成功响应：

```json
{
  "success": true,
  "data": {
    "id": 18
  }
}
```

错误：

| 场景 | `error_code` | HTTP |
|---|---:|---:|
| 帖子 ID 非法 | 4002 | 400 |
| 树洞不存在 | 4002 | 404 |
| 删除过程中出现未处理异常 | 5000 | 500 |

鉴权失败补充：

- Basic Auth 缺失或错误时，直接返回 `401 Unauthorized` 纯文本，并附 `WWW-Authenticate`

### 6.35 `DELETE /api/admin/treehole/comments/:id`

管理员删除树洞评论，需 HTTP Basic Auth。

请求示例：

```http
DELETE /api/admin/treehole/comments/6
Authorization: Basic <base64(username:password)>
```

成功响应：

```json
{
  "success": true,
  "data": {
    "id": 6,
    "postId": 18
  }
}
```

错误：

| 场景 | `error_code` | HTTP |
|---|---:|---:|
| 评论 ID 非法 | 4002 | 400 |
| 评论不存在 | 4002 | 404 |
| 删除过程中出现未处理异常 | 5000 | 500 |

鉴权失败补充：

- Basic Auth 缺失或错误时，直接返回 `401 Unauthorized` 纯文本，并附 `WWW-Authenticate`

### 6.36 `GET /api/treehole/avatar`

获取当前登录用户的树洞头像，需 Bearer JWT。

请求示例：

```http
GET /api/treehole/avatar
Authorization: Bearer <token>
```

成功响应：

返回 [5.15 `TreeholeAvatar`](#515-treeholeavatar)。

### 6.37 `POST /api/treehole/avatar`

上传并更新树洞头像，需 Bearer JWT。  
请求必须是 `multipart/form-data`，字段名固定为 `avatar`。

请求示例：

```http
POST /api/treehole/avatar
Authorization: Bearer <token>
Content-Type: multipart/form-data
```

成功响应：

返回 [5.15 `TreeholeAvatar`](#515-treeholeavatar)。

当前实现规则：

- 支持图片格式：JPG、PNG、WebP、GIF、HEIC/HEIF、AVIF、TIFF
- 单文件大小上限由 `TREEHOLE_AVATAR_MAX_BYTES` 控制，默认 `2097152`（2 MB）
- 服务端会自动处理方向并裁切为 `256x256` WebP（质量 `80`）
- 返回 URL 默认带版本参数（`?v=timestamp`）用于缓存刷新

错误：

| 场景 | `error_code` | HTTP |
|---|---:|---:|
| 请求体不是 multipart/form-data | 4002 | 400 |
| 缺失 `avatar` 字段或文件为空 | 4002 | 400 |
| 文件过大或格式不支持 | 4002 | 400 |
| 图片处理失败 | 4002 | 400 |

### 6.38 `DELETE /api/treehole/avatar`

删除当前登录用户的树洞头像，需 Bearer JWT。

请求示例：

```http
DELETE /api/treehole/avatar
Authorization: Bearer <token>
```

成功响应：

返回 [5.15 `TreeholeAvatar`](#515-treeholeavatar)，其中 `avatarUrl` 为 `null`。

### 6.39 `GET /api/treehole/notifications/unread-count`

获取树洞未读评论提醒数，需 Bearer JWT。

请求示例：

```http
GET /api/treehole/notifications/unread-count
Authorization: Bearer <token>
```

成功响应：

返回 [5.16 `TreeholeUnreadNotificationCount`](#516-treeholeunreadnotificationcount)。

### 6.40 `POST /api/treehole/notifications/read-all`

将当前用户树洞提醒全部标记为已读，需 Bearer JWT。

请求示例：

```http
POST /api/treehole/notifications/read-all
Authorization: Bearer <token>
```

成功响应：

返回 [5.17 `TreeholeReadAllNotificationsResult`](#517-treeholereadallnotificationsresult)。

### 6.41 `GET /media/treehole-avatar/:userId.webp`

访问树洞头像静态资源，无需鉴权。

请求示例：

```http
GET /media/treehole-avatar/3.webp
```

当前实现规则：

- 只有当 `users.treehole_avatar_url` 当前仍指向该路径时才可访问
- 文件不存在、用户不存在、或头像已被删除/替换时均返回 `404`
- 响应头：

```http
Cache-Control: public, max-age=31536000, immutable
```

注意：

- 这是静态媒体地址，不是 JSON API
- 前端应直接把 `avatarUrl` 作为 `<img src>` 使用
- 前端看到 URL 变化（如 `?v=...`）时应视为头像版本更新

## 7. 前端易踩坑清单

1. `schedule` 和 `v1/schedule` 当前都返回 `{ week, courses }`，不是数组，也不是“按日期分组对象”。
2. “课表暂未公布”是 `200 success=true`，不要按失败态处理。
3. 当前所有业务缓存 TTL 都是 `0`，所以普通刷新不会自动失效旧数据。
4. `_meta.cached=false` 不代表没有缓存，只表示这次响应不是直接命中缓存。
5. `refresh=true` 失败时可能收到 `stale=true` 的旧数据，此时应提示“展示旧缓存”而不是直接当成新鲜数据；同时读取 `_meta.last_error` 区分凭证恢复失败、上游超时或结构异常。
6. `_meta` 时间字段是 `+08:00`，不要按 UTC 误解。
7. 验证码 `sessionId` 只在单次二次提交中有效，且服务重启会失效。
8. `GET /api/discover/meta` 也需要 Bearer JWT，不是公开接口。
9. `POST /api/discover/posts` 必须是 `multipart/form-data`，不能发 JSON。
10. `DiscoverImage.url` 是相对路径，前端如果自己拼域名，要注意 Base URL。
11. `recommended` 当前只依赖用户评分偏好，不会因为浏览次数高就自动更靠前。
12. 发现美食里的“帖子不存在”很多场景会返回 `HTTP 404 + error_code=4002`，前端不要只盯 `error_code` 判断是否是参数错误。
13. 树洞对外匿名，但接口仍会根据当前登录用户返回 `viewer.isMine` / `isMine`，前端不要把匿名和“无法管理自己内容”混为一谈。
14. `GET /api/treehole/posts/me` 与公共列表使用同一分页结构，但只返回当前用户自己的未删除树洞。
15. `TreeholePost` 与 `TreeholeComment` 里的 `avatarUrl` 都可能为 `null`，前端必须有默认匿名头像兜底。
16. `TreeholeComment.parentCommentId` 可能为 `null`，回复 UI 不能假设它始终存在。
17. 树洞头像是独立媒体路由（`/media/treehole-avatar/*`），不是 `/api/*` JSON 接口。
18. 树洞提醒计数需要额外走 `GET/POST /api/treehole/notifications/*`，不要只依赖评论列表推断未读数。
19. 连续对 `schedule` / `v1/schedule` / `grades` 发 `refresh=true` 会触发 `4003/429`，并带 `Retry-After`，前端不能无脑并发强刷。
