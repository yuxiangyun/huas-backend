# HUAS Server API 文档

> 基线日期：2026-03-08
> Base URL：`http://localhost:3000`
> 时区约定：服务端固定使用 `Asia/Shanghai`，文档中的时间示例均为 `+08:00`

## 1. 认证与路由矩阵

| 路径 | 认证方式 | 说明 |
|---|---|---|
| `POST /auth/login` | 无 | CAS 登录，获取本服务 JWT |
| `GET /health` | 无 | 健康检查 |
| `GET /api/public/announcements` | 无 | 公告弹窗列表 |
| `GET /status` | Basic Auth | 管理状态页 HTML |
| `GET /api/admin/*` | Basic Auth | 管理接口 |
| `GET /api/schedule` | Bearer JWT | JW 课表 |
| `GET /api/v1/schedule` | Bearer JWT | Portal 课表 |
| `GET /api/grades` | Bearer JWT | 成绩 |
| `GET /api/ecard` | Bearer JWT | 一卡通余额 |
| `GET /api/user` | Bearer JWT | 用户资料 |

Bearer Token 使用：

```http
Authorization: Bearer <token>
```

管理员接口与 `/status` 使用 HTTP Basic Auth：

```http
Authorization: Basic <base64(username:password)>
```

当前代码中管理员账号密码写死在 `src/middleware/admin-basic-auth.middleware.ts`：

- 用户名：`202412040130`
- 密码：`A18569081662`

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
| `3001` | CAS 登录失败 / 教务激活失败 | 400 |
| `3002` | 验证码错误或需要验证码 | 400 |
| `3003` | 凭证过期且恢复失败，需要重新登录 | 401 |
| `3004` | 学校上游超时 | 504 |
| `4001` | JWT 无效或过期 | 401 |
| `4002` | 参数错误 | 400 |
| `5000` | 服务器内部错误 | 500 或个别路由自定义状态码 |

注意：

- `/api/ecard` 和 `/api/user` 在上游返回非鉴权类异常且解析为空时，会返回 `error_code=5000`，但 HTTP 状态码是 `502`
- `/api/schedule` 与 `/api/v1/schedule` 在“课表暂未公布”时不会报错，而是返回 `200 + success=true` 的空课表对象

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

### 3.3 限额与淘汰

| 前缀 | 默认上限 | 说明 |
|---|---:|---|
| `grades:{studentId}:*` | 20 | 成绩缓存，按哈希 key |
| `schedule:{studentId}:*` | 120 | JW 课表 |
| `portal-schedule:{studentId}:*` | 120 | Portal 课表 |

补充说明：

- 成绩命中缓存时会 `touch`，因此更接近真实 LRU
- 两个课表接口普通命中不会 `touch`，淘汰更接近“按最后写入/刷新时间保留”
- `ecard` / `user` 当前没有前缀限额

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

JW 教务课表。

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
- `3003`：凭证恢复失败
- `3004`：上游超时且没有旧缓存可回退

### 6.5 `GET /api/v1/schedule`

Portal 课表接口。虽然路径名带 `v1`，但当前语义是“统一门户源课表”。

查询参数：

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `startDate` | string | 是 | `YYYY-MM-DD` |
| `endDate` | string | 是 | `YYYY-MM-DD` |
| `refresh` | string | 否 | `true` 表示跳过读缓存并强制回源 |

约束：

- `endDate` 不能早于 `startDate`
- 日期区间不能超过 62 天

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
    "logs": {
      "limit": 50,
      "items": []
    },
    "announcements": []
  }
}
```

补充说明：

- `logs.items[].source` 取值为 `out | error`
- 日志来源是本地文件 `logs/pm2-out.log` 与 `logs/pm2-error.log`
- `grade` 不是简单取学号前四位，而是从学号中匹配第一个合法年份，例如 `S202307020119 -> 2023`

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

## 7. 前端易踩坑清单

1. `schedule` 和 `v1/schedule` 当前都返回 `{ week, courses }`，不是数组，也不是“按日期分组对象”。
2. “课表暂未公布”是 `200 success=true`，不要按失败态处理。
3. 当前所有业务缓存 TTL 都是 `0`，所以普通刷新不会自动失效旧数据。
4. `_meta.cached=false` 不代表没有缓存，只表示这次响应不是直接命中缓存。
5. `refresh=true` 失败时可能收到 `stale=true` 的旧数据，此时应提示“展示旧缓存”而不是直接当成新鲜数据。
6. `_meta` 时间字段是 `+08:00`，不要按 UTC 误解。
7. 验证码 `sessionId` 只在单次二次提交中有效，且服务重启会失效。
