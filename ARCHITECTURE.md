# HUAS Server 认证架构

## 概览

HUAS Server 采用**双层认证**架构：

- **外层**：自有 JWT（90 天），标识用户身份
- **内层**：学校短效凭证（分钟级），代理访问学校系统

用户只感知外层 JWT。内层凭证的获取、刷新、重建全部由服务端透明处理。

```
┌─────────────────────────────────────────────────────┐
│                     客户端                           │
│   持有: Self JWT (90d)                              │
│   不感知: TGC / Portal JWT / JW Session             │
└──────────────────────┬──────────────────────────────┘
                       │ Authorization: Bearer <jwt>
                       ▼
┌─────────────────────────────────────────────────────┐
│                   HUAS Server                        │
│                                                      │
│  ┌─────────┐  ┌──────────┐  ┌────────────────────┐  │
│  │ Self JWT │  │ 凭证管理  │  │ SQLite (持久化)     │  │
│  │ 90 天    │  │          │  │                    │  │
│  │ 身份验证  │→│ TGC 20h  │←→│ users              │  │
│  │          │  │ Portal 10m│  │ credentials        │  │
│  │          │  │ JW    10m │  │ cache              │  │
│  └─────────┘  └──────────┘  └────────────────────┘  │
│                     │                                │
│                     ▼                                │
│            ┌────────────────┐                        │
│            │  学校 CAS/JW   │                        │
│            │  Portal 系统   │                        │
│            └────────────────┘                        │
└─────────────────────────────────────────────────────┘
```

---

## 凭证体系

| 凭证 | 来源 | 有效期 | 用途 | 存储 |
|------|------|--------|------|------|
| **Self JWT** | 服务端签发 (HS256) | 90 天 | 客户端身份标识 | 客户端 localStorage |
| **CAS TGC** | 学校 CAS 登录 | ~20 小时 | 派发 Portal/JW 凭证 | SQLite `credentials` (Cookie Jar) |
| **Portal JWT** | TGC 换取 | ~10 分钟 | 访问 Portal API (一卡通/用户信息) | SQLite `credentials` (value) |
| **JW Session** | TGC → SSO 激活 | ~10 分钟 | 访问教务系统 (课表/成绩) | SQLite `credentials` (Cookie Jar) |
| **加密密码** | 用户登录时存储 | 永久 | 静默重认证 CAS | SQLite `users` (AES-256-GCM) |

---

## 场景 1：首次登录

用户第一次使用，无任何凭证。

```
客户端                        服务端                          学校 CAS
  │                            │                               │
  │  POST /auth/login          │                               │
  │  {username, password}      │                               │
  │ ──────────────────────────→│                               │
  │                            │  getExecution()               │
  │                            │──────────────────────────────→│
  │                            │  ← execution token            │
  │                            │                               │
  │                            │  RSA 加密密码                  │
  │                            │  POST CAS login (无验证码)     │
  │                            │──────────────────────────────→│
  │                            │                               │
  │              ┌─────────────┤  302 + ticket ✓               │
  │              │ 可能的分支:  │←──────────────────────────────│
  │              │             │                               │
  │  ┌───── 成功 ─┘             │  followRedirects → 获取 TGC   │
  │  │                         │  extractToken → Portal JWT    │
  │  │                         │                               │
  │  │                         │  exchangeJwSession()          │
  │  │                         │  TGC → SSO → 教务激活 (3次重试) │
  │  │                         │──────────────────────────────→│  学校教务
  │  │                         │  ← JSESSIONID ✓              │
  │  │                         │                               │
  │  │                         │  获取用户信息 (Portal API)     │
  │  │                         │  AES 加密密码 → 存入 DB        │
  │  │                         │  存储 3 组凭证 → SQLite        │
  │  │                         │  签发 Self JWT (90d)           │
  │  │                         │                               │
  │  │  {token, user}          │                               │
  │  │←────────────────────────│                               │
  │  │                         │                               │
  │  │  需要验证码 ─┘           │                               │
  │  │                         │  CAS 返回验证码错误            │
  │  │                         │  → getCaptcha() 获取图片       │
  │  │                         │  → 保存 session (Cookie+Exec) │
  │  │                         │                               │
  │  │  {needCaptcha: true,    │                               │
  │  │   captchaImage, sessionId}                              │
  │  │←────────────────────────│                               │
  │  │                         │                               │
  │  │  POST /auth/login       │                               │
  │  │  + captcha + sessionId  │  恢复 Cookie Jar + execution  │
  │  │ ──────────────────────→│  重试 CAS login ──────────────→│
  │                            │                               │
```

**关键点：**
- 首次登录不需要验证码，直接尝试用户名+密码
- 仅当 CAS 返回验证码错误时，服务端才获取验证码并返回给前端
- 密码经 AES-256-GCM 加密后存入数据库，用于后续静默重认证
- 一次登录同时获取 TGC + Portal JWT + JW Session 三组凭证

**终端日志：**
```
AUTH 202412040130 → 成功   1823ms 张三
  ├ portal ✓  JW SSO ✓  JW 重定向 ✓
```

---

## 场景 2：正常数据请求（凭证有效）

用户已登录，Self JWT 有效，内层凭证也未过期。

```
客户端                        服务端                          学校
  │                            │                               │
  │  GET /api/schedule         │                               │
  │  Authorization: Bearer JWT │                               │
  │ ──────────────────────────→│                               │
  │                            │  authMiddleware:              │
  │                            │  verifyToken(jwt) → ✓         │
  │                            │  → userId, studentId          │
  │                            │                               │
  │                            │  CacheService.get() ──→ 命中?  │
  │                            │                               │
  │              ┌── 缓存命中 ──┤  直接返回 (不访问学校)         │
  │              │             │                               │
  │  {data, _meta.cached:true} │                               │
  │←──────────────────────────│                               │
  │              │             │                               │
  │              └── 缓存未命中 ┤                               │
  │                            │  upstream('jw', fn):          │
  │                            │  buildHttpClient()            │
  │                            │  → getCredential('jw_session')│
  │                            │  → 有效 ✓ → 构建 HttpClient   │
  │                            │                               │
  │                            │  POST 教务课表接口             │
  │                            │──────────────────────────────→│
  │                            │  ← HTML                      │
  │                            │  ScheduleParser.parse()       │
  │                            │  CacheService.set() → SQLite  │
  │                            │                               │
  │  {data, _meta.cached:false,│                               │
  │   _meta.source:'jw'}       │                               │
  │←──────────────────────────│                               │
```

**终端日志：**
```
GET  /api/schedule 200   9ms  202412040130  ▪ cache     ← 缓存命中
GET  /api/schedule 200 577ms  202412040130  ▪ jw        ← 上游请求
```

---

## 场景 3：JW Session 过期（TGC 有效）

JW Session 10 分钟过期，但 TGC 20 小时仍有效。

```
客户端                        服务端                          学校
  │                            │                               │
  │  GET /api/grades?refresh   │                               │
  │  Authorization: Bearer JWT │                               │
  │ ──────────────────────────→│                               │
  │                            │  upstream('jw', fn):          │
  │                            │  buildHttpClient()            │
  │                            │  → getOrRefreshCredential()   │
  │                            │  → getCredential('jw_session')│
  │                            │  → 已过期! (10min TTL)        │
  │                            │                               │
  │                            │  → getCredential('cas_tgc')   │
  │                            │  → 有效 ✓ (20h TTL)           │
  │                            │                               │
  │                            │  refreshFromTGC():            │
  │                            │  TGC Cookie → SSO 激活教务     │
  │                            │──────────────────────────────→│
  │                            │  ← 新 JSESSIONID ✓           │
  │                            │  storeCredential('jw_session')│
  │                            │                               │
  │                            │  用新凭证请求成绩接口          │
  │                            │──────────────────────────────→│
  │                            │  ← 成绩 HTML                 │
  │                            │                               │
  │  {data, _meta.source:'jw'} │                               │
  │←──────────────────────────│  用户无感知                    │
```

**终端日志：**
```
CAS↻ 1 → 静默刷新 JW   234ms
  ├ TGC → JW Session ✓
GET  /api/grades 200  1200ms  202412040130  ▪ jw
```

---

## 场景 4：Portal JWT 过期（TGC 有效）

Portal JWT 10 分钟过期，TGC 仍有效。

```
客户端                        服务端                          学校
  │                            │                               │
  │  GET /api/ecard            │                               │
  │ ──────────────────────────→│                               │
  │                            │  upstream('portal', fn):      │
  │                            │  getOrRefreshCredential()     │
  │                            │  → portal_jwt 已过期!         │
  │                            │                               │
  │                            │  → cas_tgc 有效 ✓             │
  │                            │  refreshFromTGC():            │
  │                            │  TGC → Portal 服务 → 新 JWT   │
  │                            │──────────────────────────────→│
  │                            │  ← Portal JWT ✓              │
  │                            │                               │
  │                            │  用新 Portal JWT 请求一卡通   │
  │                            │──────────────────────────────→│
  │                            │  ← 余额数据                  │
  │                            │                               │
  │  {data}                    │                               │
  │←──────────────────────────│  用户无感知                    │
```

**终端日志：**
```
CAS↻ 1 → 静默刷新 Portal   187ms
  ├ TGC → Portal JWT ✓
GET  /api/ecard 200  450ms  202412040130  ▪ portal
```

---

## 场景 5：运行时 SESSION_EXPIRED（学校主动踢出）

凭证在 TTL 内但学校侧已失效（如学校重启、主动清理会话）。

```
客户端                        服务端                          学校
  │                            │                               │
  │  GET /api/schedule?refresh │                               │
  │ ──────────────────────────→│                               │
  │                            │  upstream('jw', fn):          │
  │                            │  jw_session 未过期 → 构建客户端│
  │                            │                               │
  │                            │  POST 教务课表接口 ──────────→│
  │                            │  ← 302 → cas/login           │
  │                            │                               │
  │                            │  HttpClient 检测: 重定向到 CAS │
  │                            │  throw SESSION_EXPIRED        │
  │                            │                               │
  │                            │  upstream 捕获:               │
  │                            │  invalidate('jw_session')     │
  │                            │                               │
  │                            │  第 2 次 buildContext():      │
  │                            │  → getOrRefreshCredential()   │
  │                            │  → jw_session 已删除          │
  │                            │  → TGC 有效? → refreshFromTGC │
  │                            │     TGC 无效? → silentReAuth  │
  │                            │  → 获取新凭证                 │
  │                            │                               │
  │                            │  用新凭证重试 POST ──────────→│
  │                            │  ← 课表 HTML ✓               │
  │                            │                               │
  │  {data}                    │                               │
  │←──────────────────────────│  用户无感知                    │
```

**终端日志：**
```
WARN [Upstream] jw_session 会话过期, 重试中  202412040130
CAS↻ 1 → 静默刷新 JW   234ms
  ├ TGC → JW Session ✓
GET  /api/schedule 200  1500ms  202412040130  ▪ jw
```

---

## 场景 6：TGC + 子凭证全部过期 → 静默重认证

TGC 20 小时过期，所有凭证失效，需要完整重跑 CAS 流程。

```
客户端                        服务端                          学校 CAS
  │                            │                               │
  │  GET /api/grades           │                               │
  │ ──────────────────────────→│                               │
  │                            │  upstream('jw', fn):          │
  │                            │  getOrRefreshCredential()     │
  │                            │  → jw_session 过期            │
  │                            │  → cas_tgc 过期!              │
  │                            │                               │
  │                            │  silentReAuth(userId):        │
  │                            │  ① 冷却检查 (3次/10min)       │
  │                            │  ② DB 查用户 → 取加密密码     │
  │                            │  ③ AES 解密密码               │
  │                            │                               │
  │                            │  ④ getExecution()             │
  │                            │──────────────────────────────→│
  │                            │  ← execution token            │
  │                            │                               │
  │                            │  ⑤ RSA 加密 + login (无验证码)│
  │                            │──────────────────────────────→│
  │                            │  ← 302 + ticket ✓            │
  │                            │                               │
  │                            │  ⑥ exchangeJwSession()        │
  │                            │──────────────────────────────→│  教务
  │                            │  ← JSESSIONID ✓              │
  │                            │                               │
  │                            │  ⑦ 存储 TGC + Portal + JW     │
  │                            │  ⑧ 重置冷却计数               │
  │                            │                               │
  │                            │  用新凭证请求成绩             │
  │                            │──────────────────────────────→│
  │                            │  ← 成绩数据 ✓                │
  │                            │                               │
  │  {data}                    │                               │
  │←──────────────────────────│  用户无感知                    │
```

**终端日志：**
```
WARN [CredentialManager] jw_session 刷新失败, 尝试静默重认证  1
CAS↻ 202412040130 → 静默重认证成功  1823ms 张三
  ├ CAS Cookie ✓  Execution ✓  CAS Login ✓  Portal ✓  JW 激活 ✓
GET  /api/grades 200  2400ms  202412040130  ▪ jw
```

**保护机制：** 连续失败 3 次后进入 10 分钟冷却期，防止 CAS 封禁 IP。

---

## 场景 7：Self JWT 过期

Self JWT 90 天到期，用户需要重新登录。

```
客户端                        服务端
  │                            │
  │  GET /api/schedule         │
  │  Authorization: Bearer JWT │
  │ ──────────────────────────→│
  │                            │  authMiddleware:
  │                            │  verifyToken(jwt)
  │                            │  → exp 已过期 → null
  │                            │
  │  401                       │
  │  {error_code: 4001,        │
  │   error_message:           │
  │   "Invalid or expired      │
  │    token"}                 │
  │←──────────────────────────│
  │                            │
  │  用户需重新走场景 1 登录    │
  │  POST /auth/login          │
  │  {username, password}      │
  │ ──────────────────────────→│
  │                            │  ... 完整 CAS 流程 ...
  │                            │  签发新 JWT (90d)
  │  {token, user}             │
  │←──────────────────────────│
```

**注意：** Self JWT 过期不会触发静默重认证。用户必须主动重新登录，因为 Self JWT 是服务端对用户身份的认证，不依赖学校系统。

---

## 凭证刷新决策树

```
请求到达 → authMiddleware 验证 Self JWT
                │
          JWT 有效？──── 否 → 401 "请重新登录"
                │
               是
                │
          需要学校数据？
                │
               是
                │
       CacheService.get() 命中？
           │              │
          是              否
           │              │
      返回缓存      upstream() 构建上下文
      (0ms~5ms)           │
                   getOrRefreshCredential()
                          │
                ┌─────────┼──────────┐
                │         │          │
           凭证有效    凭证过期    凭证不存在
                │         │          │
            直接使用   TGC 有效？      │
                │     │       │      │
                │    是      否      │
                │     │       │      │
                │  TGC 刷新  TGC 也过期
                │  (~200ms)    │
                │     │    silentReAuth
                │     │    (~1500ms)
                │     │       │
                │     │  ┌────┼────┐
                │     │  │         │
                │     │ 成功     失败
                │     │  │    (3次后冷却)
                │     │  │         │
                ▼     ▼  ▼         ▼
              请求学校接口      CREDENTIAL_EXPIRED
                │               → 401 "请重新登录"
                │
           响应正常？──── 否 (SESSION_EXPIRED)
                │              │
               是          invalidate + 重试 1 次
                │          (回到 getOrRefreshCredential)
                │
          解析 + 缓存 + 返回
```

---

## 凭证生命周期时间线

```
登录
 │
 ├── Self JWT ─────────────────────────────────────────── 90 天 ──→ 过期 → 需重新登录
 │
 ├── TGC ──────────────── 20 小时 ──→ 过期 → silentReAuth
 │    │
 │    ├── Portal JWT ── 10 分钟 ──→ 过期 → TGC 刷新 (或 silentReAuth)
 │    │
 │    └── JW Session ── 10 分钟 ──→ 过期 → TGC 刷新 (或 silentReAuth)
 │
 └── 加密密码 ─────────────────────────────────────────── 永久保存 (支撑 silentReAuth)
```

---

## API 参考

### POST /auth/login

首次登录，无需验证码。

**Request:**
```json
{ "username": "2024001", "password": "xxx" }
```

**成功 Response:**
```json
{
  "success": true,
  "data": {
    "token": "eyJhbG...",
    "user": { "name": "张三", "studentId": "2024001", "className": "计科2401" }
  }
}
```

**需要验证码 Response (400):**
```json
{
  "success": false,
  "error_code": 3002,
  "error_message": "需要验证码",
  "needCaptcha": true,
  "sessionId": "uuid-xxx",
  "captchaImage": "base64..."
}
```

**带验证码重试:**
```json
{ "username": "2024001", "password": "xxx", "captcha": "a3kf", "sessionId": "uuid-xxx" }
```

### 数据 API（需 JWT）

| 端点 | 方法 | 上游 | 缓存 TTL | 说明 |
|------|------|------|----------|------|
| `/api/schedule` | GET | JW | 24 小时 | `?date=2024-03-01` `?refresh=true` |
| `/api/v1/schedule` | GET | Portal | 24 小时 | `?startDate=...&endDate=...` |
| `/api/grades` | GET | JW | 永久 | `?term=...` `?refresh=true` |
| `/api/ecard` | GET | Portal | 永久 | `?refresh=true` |
| `/api/user` | GET | Portal | 永久 | `?refresh=true` |
| `/health` | GET | - | - | 公开，无需 JWT |

### 错误码

| 错误码 | HTTP | 含义 |
|--------|------|------|
| 3001 | 400 | CAS 登录失败（密码错误等） |
| 3002 | 400 | 需要验证码 |
| 3003 | 401 | 学校凭证过期且刷新失败 |
| 3004 | 504 | 学校服务器超时 |
| 4001 | 401 | Self JWT 无效或过期 |
| 4002 | 400 | 请求参数错误 |
| 5000 | 500 | 内部错误 |

---

## 终端日志标签

| 标签 | 颜色 | 含义 |
|------|------|------|
| `AUTH` | 蓝色 | 用户主动登录 |
| `CAS↻` | 紫色 | 静默刷新 / 静默重认证 |
| `ERR` | 红色 | 认证失败 |
| `GET` / `POST` | 青/紫 | HTTP 请求 |
| `▪ cache` | 黄色 | 缓存命中 |
| `▪ jw` / `▪ portal` | 绿色 | 上游请求 |
| `WARN` | 黄色 | 警告（会话过期、刷新失败等） |
| `SRV` | 绿色 | 服务器事件 |
