# HUAS Server API 文档

> 基线日期：2026-08-23
> Base URL：`http://localhost:3000`
> 时区约定：服务端固定使用 `Asia/Shanghai`，文档中的时间示例均为 `+08:00`

## 1. 认证与路由矩阵

| 路径 | 认证方式 | 说明 |
|---|---|---|
| `POST /auth/login` | 无 | CAS 登录，获取本服务 JWT |
| `GET /health`、`GET /health/live`、`GET /health/ready` | 无 | 兼容健康、存活与本地依赖/schema 就绪检查 |
| `GET /api/public/announcements` | 无 | 公告弹窗列表 |
| `POST/GET/DELETE /api/admin/session` | 登录凭据 / 后台 Cookie | 建立、探测与撤销后台会话 |
| `GET /api/admin/dashboard` | 后台 HttpOnly Cookie | 管理仪表盘 |
| `GET /api/admin/analytics/overview` | 后台 HttpOnly Cookie | 7/30/90 天渠道与功能使用分析 |
| `GET/PUT /api/admin/academic/schedule-source-policy` | 后台 HttpOnly Cookie | 课表 JW/Portal 优先模式热切换 |
| `GET/POST/PUT/DELETE /api/admin/announcements*` | 后台 HttpOnly Cookie | 公告管理 |
| `GET /api/admin/logs` | 后台 HttpOnly Cookie | 终端日志读取 |
| `DELETE /api/admin/discover/posts/:id` | 后台 HttpOnly Cookie | Discover 管理删帖 |
| `GET/DELETE /api/admin/treehole/*` | 后台 HttpOnly Cookie | Treehole 管理接口 |
| `GET /api/admin/messaging/*` | 后台 HttpOnly Cookie | 私信会话、消息与媒体只读管理接口 |
| `GET /api/schedule` | Bearer JWT | 后端策略控制 JW/Portal 优先级的统一周课表 |
| `GET /api/v1/schedule` | Bearer JWT | Portal 优先课表；周视图请求失败时可回退 JW |
| `GET /api/calendar/link` | Bearer JWT | 获取当前用户日历订阅链接 |
| `GET /api/grades` | Bearer JWT | 成绩 |
| `GET/POST /api/evaluations/*` | Bearer JWT | 评教发现、状态、预检与提交 |
| `GET /api/classrooms/*` | Bearer JWT | 空教室只读查询 |
| `GET /api/ecard` | Bearer JWT | 一卡通余额 |
| `GET /api/ecard/overview` | Bearer JWT | Portal 余额与 mobile-yxt 单月三类账单聚合，分别投影子源新鲜度 |
| `GET /api/utilities/electricity` | Bearer JWT | 当前绑定房间电费只读信息；电价/电量允许为 `null` |
| `GET /api/user` | Bearer JWT | 用户资料 |
| `GET/PUT/DELETE /api/community/*` | Bearer JWT | Community 公共资料、昵称与头像接口 |
| `GET/POST/PUT/DELETE /api/discover/*` | Bearer JWT | Discover 帖子、幂等点赞、评论与用户帖子接口 |
| `GET/POST/PUT/DELETE /api/treehole/*` | Bearer JWT | 实名绑定的“树洞”帖子、点赞、评论与用户帖子接口 |
| `GET/PUT /api/notifications/*` | Bearer JWT | 六类活动通知列表、未读计数与逐条已读 |
| `GET/POST/PUT /api/messaging/*` | Bearer JWT | 一对一会话、图文消息、阅读游标、未读数与私有媒体 |
| `GET /calendar/schedule.ics` | `studentId + sig` 查询参数 | 本周课表 ICS 订阅 |
| `GET /media/discover/*` | 无 | 发现美食图片访问，仅未删除帖子可访问 |
| `GET /media/treehole-avatar/*` | 无 | Community 头像兼容媒体路径，仅当前仍发布的头像可访问 |
| `GET /metrics` | 无 | Prometheus 文本指标 |

Bearer Token 使用：

```http
Authorization: Bearer <token>
```

管理员接口先建立独立后台会话，再携带 HttpOnly Cookie：

```http
POST /api/admin/session
Content-Type: application/json

{"username":"...","password":"..."}
```

日历订阅签名使用：

```http
GET /calendar/schedule.ics?studentId=2023001001&sig=<hmac_sha256(studentId, CALENDAR_SECRET)>
```

补充说明：

- `/api/admin/session` 建立无时间自动失效的 HttpOnly Cookie；其余 `/api/admin/*` 统一由 `adminSessionMiddleware` 保护，普通用户 Bearer JWT 不具备后台权限
- 日历订阅不是 JWT，也不落库；它是固定链接，签名规则是 `HMAC_SHA256(studentId, CALENDAR_SECRET)`

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

- `_meta` 只出现在带缓存语义的业务接口上：`/api/schedule`、`/api/v1/schedule`、`/api/grades`、`/api/ecard`、`/api/utilities/electricity`、`/api/user`
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
| `policy_mode` | string | `/api/schedule` 本次请求采用的 `jw-first` 或 `portal-first` 快照 |
| `primary_source` | string | 本次策略首选来源，取值 `jw` 或 `portal` |
| `fallback` | string | 实际跨源/旧缓存回退，取值 `jw`、`portal` 或 `stale` |

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
| `3005` | 服务账号未配置或不可用 | 503 |
| `4003` | 请求过于频繁（教务强制刷新或私信发送） | 429 |
| `4004` | 需要先完成评教 | 409 |
| `5000` | 服务器内部错误 | 500 或个别路由自定义状态码 |

注意：

- `/api/ecard` 和 `/api/user` 在上游返回非鉴权类异常且解析为空时，会返回 `error_code=5000`，但 HTTP 状态码是 `502`
- `/api/schedule` 与 `/api/v1/schedule` 在“课表暂未公布”时不会报错，而是返回 `200 + success=true` 的空课表对象
- `refresh=true` 回源失败且存在旧缓存时，仍可能返回 `200 + success=true`，客户端必须通过 `_meta.stale=true` 和 `_meta.refresh_failed=true` 判断这不是新鲜数据
- JW 有时会用 HTTP 200 返回登录页，例如账号在其他地方登录导致当前 JW 会话失效；服务端会把这类页面识别为凭证过期并尝试自动恢复

## 3. 当前缓存语义

这是当前代码基线下的真实行为，不是历史设计稿：

### 3.1 统一规则

- 所有 7 个带缓存语义的校园业务接口都会把成功回源结果写入 `cache` 表
- `refresh=false`：先查缓存，命中直接返回
- `refresh=true`：跳过读缓存，强制回源，并覆盖写回缓存
- `/api/schedule` 的首选来源 current 失败后，必须先尝试第二来源 current；两边都失败才固定按 JW、Portal 顺序查旧缓存
- 其他单源业务回源失败时：如果同 key 还有旧缓存，会回退旧缓存并返回 `_meta.stale=true`

### 3.2 当前 TTL

| 接口 | 当前 TTL | 实际效果 |
|---|---|---|
| `GET /api/schedule` | `0` | 写入缓存，但不过期，仅 `refresh=true` 会覆盖 |
| `GET /api/v1/schedule` | `0` | 写入缓存，但不过期，仅 `refresh=true` 会覆盖 |
| `GET /api/grades` | `0` | 写入缓存，但不过期，仅 `refresh=true` 会覆盖 |
| `GET /api/ecard` | `0` | 写入缓存，但不过期，仅 `refresh=true` 会覆盖 |
| `GET /api/ecard/overview` | `0` | 余额与用户月份交易分别缓存；返回子源级 freshness，降级缓存不会冒充新鲜回源 |
| `GET /api/utilities/electricity` | `0` | 成功 DTO 写入缓存；协议错误不写入、不回退旧缓存 |
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

### 5.5 Operations 领域模型

公告、Dashboard、分析、终端日志及后台会话的稳定类型见 [OPERATIONS_API.md](./OPERATIONS_API.md)。

### 5.6 社交领域模型

Community、Discover、Treehole、Notifications 与 Messaging 的当前契约统一见 [SOCIAL_API.md](./SOCIAL_API.md)。社交内容中的公开人物字段固定为 `{ id, displayName, avatarUrl }`；只有当前用户 `/api/community/profile` 额外返回 `nickname`。会话/通知稳定增量、消息三态游标、私信 Blob 鉴权和真实 400/401/404/413 语义均以该分册为准。

## 6. 接口明细

### 6.1 Operations API

公共公告与全部后台 Cookie 会话接口见 [OPERATIONS_API.md](./OPERATIONS_API.md)。

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

后端热策略控制的统一周课表接口。客户端不能通过 query 选择来源；每次请求开始时读取一次策略快照。

两种状态机：

```text
jw-first:     JW current → Portal current → JW stale → Portal stale → 错误/合法空课表
portal-first: Portal current → JW current → JW stale → Portal stale → 错误/合法空课表
```

`current` 保留既有缓存语义：`refresh=false` 可以命中该来源未过期/永久缓存，`refresh=true` 强制访问校园上游。关键约束是单源失败时不得先返回自身 stale；旧缓存阶段始终 JW 优先。`_meta.source` 表示实际数据来源，不能用它推断策略首选来源。

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
    "source": "jw",
    "policy_mode": "jw-first",
    "primary_source": "jw"
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
- 非凭证型故障且有旧缓存可回退时，接口返回 `200`，并用 `_meta.stale=true`、`refresh_failed=true`、`fallback=stale` 与 `last_error` 暴露降级
- 两个来源的凭证错误经优先级仲裁后必须返回 `3003/401`，旧缓存不能掩盖重新登录要求

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

### 6.8 `GET /api/ecard/overview`

聚合既有 Portal 一卡通余额与 mobile-yxt 指定自然月的消费、充值、补助交易。只接受当前月及此前 23 个北京时间自然月。

查询参数：

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `month` | string | 否 | 严格 `YYYY-MM`；默认当前北京时间月份 |
| `refresh` | string | 否 | `true` 表示余额与交易都跳过读缓存并强制回源 |

成功响应：

```json
{
  "success": true,
  "data": {
    "balance": { "amountCents": 12850, "status": "正常" },
    "month": "2026-08",
    "totals": {
      "consumptionCents": -3560,
      "rechargeCents": 10000,
      "subsidyCents": 2000,
      "electricityCents": -1200
    },
    "transactions": [],
    "partial": false,
    "unavailableParts": [],
    "staleParts": [],
    "degraded": false,
    "freshness": {
      "balance": { "cached": false, "source": "portal" },
      "transactions": { "cached": false, "source": "mobile-yxt" }
    },
    "truncated": false
  }
}
```

字段语义：

- `amountCents`、交易 `amountCents` 与四类 totals 都使用整数分
- totals 按交易分类机械汇总上游有符号金额；当前不根据 `refundFlag` 推断退款会计规则
- `partial/unavailableParts` 只表达子源不可用；`staleParts` 表达实际使用了旧缓存
- `degraded` 在任一子源不可用或 stale 时为 `true`
- `freshness.balance` 与 `freshness.transactions` 独立保留 `cached/stale/refresh_failed/last_error` 等缓存事实
- `truncated=true` 表示至少一个交易分类达到服务端分页硬上限，不能把 totals 当作完整月度总额

### 6.9 `GET /api/utilities/electricity`

读取当前绑定房间的电费账户。服务端先从 mobile-yxt electric config 获取绑定位置，再携带位置 code 读取 account；不调用 bind、用电明细、水费或缴费能力。

查询参数：

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `refresh` | string | 否 | `true` 表示跳过读缓存并强制回源 |

成功响应：

```json
{
  "success": true,
  "data": {
    "roomDisplayName": "西校区 九舍 418",
    "cardBalanceCents": 1234,
    "priceCentsPerKwh": 62,
    "remainingKwh": "-11.10",
    "accountStatus": "正常",
    "detailsAvailable": false,
    "officialPaymentAvailable": false
  },
  "_meta": {
    "cached": false,
    "source": "mobile-yxt"
  }
}
```

字段语义：

- `roomDisplayName` 按 config.location 的校区、楼栋、楼层、房间有效字段顺序组合
- `cardBalanceCents` 和 `priceCentsPerKwh` 使用整数分，避免浮点金额
- `priceCentsPerKwh` 类型为 `number | null`；`remainingKwh` 类型为 `string | null`
- `null` 只表示上游当前未提供对应值，不表示 0、欠费或凭证失效
- `remainingKwh` 保留上游十进制字符串与负号
- 只有明确 HTTP 401 才会失效并重建 mobile-yxt 派生会话；HTTP 200 的业务/协议失败不会清理会话

### 6.10 `GET /api/user`

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

### 6.11 Operations 管理 API

后台 session、Dashboard、analytics、logs、announcements、课表来源策略与社交管理入口见 [OPERATIONS_API.md](./OPERATIONS_API.md)。

### 6.12 社交 API

Community、Discover、Treehole、Notifications 与 Messaging 的用户契约见 [SOCIAL_API.md](./SOCIAL_API.md)。
