# HUAS Server API 文档

> Base URL: `http://localhost:3000`

## 认证

除 `/auth/login` 和 `/health` 外，所有 `/api/*` 接口需要 Bearer Token 认证。

```
Authorization: Bearer <token>
```

Token 通过 `/auth/login` 获取，有效期 90 天。

---

## 响应格式

### 成功

```json
{
  "success": true,
  "data": { ... },
  "_meta": {
    "cached": false,
    "source": "jw",
    "updated_at": "2026-03-06T10:00:00.000Z",
    "expires_at": "2026-03-07T10:00:00.000Z"
  }
}
```

`_meta` 仅在有缓存信息时出现，`cached: true` 表示数据来自本地缓存。
当 `refresh=true` 回源失败但存在旧缓存时，接口会返回旧缓存并附带：
- `_meta.stale: true`
- `_meta.refresh_failed: true`
- `_meta.last_error: 3003 | 3004 | 5000`

### 失败

```json
{
  "success": false,
  "error_code": 3001,
  "error_message": "登录失败"
}
```

---

## 错误码

| 错误码 | 含义 | HTTP 状态码 |
|--------|------|-------------|
| 3001 | CAS 登录失败 | 400 |
| 3002 | 验证码错误/需要验证码 | 400 |
| 3003 | 凭证过期（需重新登录） | 401 |
| 3004 | 学校服务器超时 | 504 |
| 4001 | JWT 无效或过期 | 401 |
| 4002 | 参数错误 | 400 |
| 5000 | 服务器内部错误 | 500 |

---

## 接口列表

### POST /auth/login

CAS 统一认证登录，获取 JWT Token。

**首次登录**不需要验证码，仅在学校 CAS 要求时才返回验证码。

#### 请求

```json
{
  "username": "2023001001",
  "password": "your_password"
}
```

#### 成功响应

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

#### 需要验证码

当 CAS 要求验证码时，返回验证码图片和 sessionId：

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

`captchaImage` 是 Base64 编码的 PNG 图片。前端显示后，用户输入验证码，携带 `sessionId` 重新请求：

```json
{
  "username": "2023001001",
  "password": "your_password",
  "captcha": "AB12",
  "sessionId": "550e8400-e29b-41d4-a716-446655440000"
}
```

#### 错误示例

| 场景 | error_code | error_message |
|------|-----------|---------------|
| 用户名/密码为空 | 4002 | 用户名和密码不能为空 |
| 请求体非 JSON | 4002 | 请求体必须是有效的 JSON |
| 密码错误 | 3001 | 您提供的用户名或者密码有误 |
| 学校超时 | 3004 | 学校服务器超时 |
| 教务激活失败 | 3001 | 教务系统激活失败 |

---

### GET /api/schedule

获取教务系统课程表（JW 教务源）。

#### 参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| date | string | 否 | 日期，格式 `YYYY-MM-DD`，默认当天 |
| refresh | string | 否 | 设为 `true` 跳过缓存 |

#### 请求示例

```
GET /api/schedule?date=2026-03-06
Authorization: Bearer eyJ...
```

#### 响应

```json
{
  "success": true,
  "data": [
    {
      "name": "高等数学",
      "teacher": "李教授",
      "location": "教A301",
      "day": 1,
      "section": "1-2",
      "weekStr": "1-16周"
    }
  ],
  "_meta": {
    "cached": true,
    "source": "jw",
    "updated_at": "2026-03-06T08:00:00.000Z"
  }
}
```

缓存有效期：24 小时。

---

### GET /api/v1/schedule

获取 Portal 课程表（统一门户源），支持日期范围查询。

#### 参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| startDate | string | 是 | 起始日期 `YYYY-MM-DD` |
| endDate | string | 是 | 结束日期 `YYYY-MM-DD` |
| refresh | string | 否 | 设为 `true` 跳过缓存 |

#### 请求示例

```
GET /api/v1/schedule?startDate=2026-03-01&endDate=2026-03-31
Authorization: Bearer eyJ...
```

#### 响应

数据结构与 Portal 日历格式一致，按日期分组。

缓存有效期：24 小时。

---

### GET /api/grades

获取成绩列表。

#### 参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| term | string | 否 | 学期，如 `2025-2026-1`，空则查全部 |
| kcxz | string | 否 | 课程性质筛选 |
| kcmc | string | 否 | 课程名称搜索 |
| refresh | string | 否 | 设为 `true` 跳过缓存 |

#### 请求示例

```
GET /api/grades?term=2025-2026-1
Authorization: Bearer eyJ...
```

#### 响应

```json
{
  "success": true,
  "data": {
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
  },
  "_meta": { "cached": false, "source": "jw" }
}
```

默认不缓存（`cacheTtl.grades = 0`），每次请求实时获取。

---

### GET /api/ecard

获取一卡通余额信息。

#### 参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| refresh | string | 否 | 设为 `true` 跳过缓存 |

#### 请求示例

```
GET /api/ecard
Authorization: Bearer eyJ...
```

#### 响应

```json
{
  "success": true,
  "data": {
    "balance": 128.50,
    "status": "正常",
    "lastTime": "2026-03-06 12:30:00"
  },
  "_meta": { "cached": false, "source": "portal" }
}
```

默认不缓存，每次请求实时获取。

---

### GET /api/user

获取用户信息。

#### 参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| refresh | string | 否 | 设为 `true` 跳过缓存 |

#### 请求示例

```
GET /api/user
Authorization: Bearer eyJ...
```

#### 响应

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
  "_meta": { "cached": false, "source": "portal" }
}
```

默认不缓存。

---

### GET /health

健康检查，无需认证。

#### 响应

```json
{
  "success": true,
  "data": {
    "status": "ok",
    "timestamp": "2026-03-06T10:00:00.000Z",
    "uptime": 3600.123
  }
}
```

---

## 凭证自动刷新

客户端无需关心学校侧凭证的过期与刷新，服务端自动处理：

1. **JW Session / Portal JWT 过期** → 自动用 TGC 刷新
2. **TGC 过期** → 自动用存储的加密密码静默重认证
3. **静默重认证失败 3 次** → 进入 10 分钟冷却期，返回 `3003 凭证过期`

客户端只需在收到 `error_code: 4001`（JWT 无效）时重新登录。

---

## 数据来源

| 接口 | 数据源 | 凭证类型 |
|------|--------|---------|
| /api/schedule | 教务系统 (JW) | jw_session |
| /api/v1/schedule | 统一门户 (Portal) | portal_jwt |
| /api/grades | 教务系统 (JW) | jw_session |
| /api/ecard | 统一门户 (Portal) | portal_jwt |
| /api/user | 统一门户 (Portal) | portal_jwt |
