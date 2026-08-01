# 文理小助手 Web 架构

> 当前基线：2026-08-02
> 代码位置：`web/`
> 生产入口：`/m`

## 1. 产品边界

Web 前端是移动端优先的校园应用，普通用户只保留四个一级入口：

- `树洞`：文字优先的社区信息流，是登录后默认页。
- `好饭`：图片优先的食堂推荐信息流。
- `消息`：私信与互动通知，两类未读事实保持独立。
- `我的`：社区资料、个人内容、日历订阅与退出入口。

代码与 API 仍使用 `Discover` / `Treehole` 作为稳定领域名，用户可见文案统一为“好饭”/“树洞”。当前不支持游客态，未登录用户只能进入 `/m/login`。

## 2. 技术栈

| 范围 | 选型 | 职责 |
|---|---|---|
| 构建 | Vite 7 + TypeScript | 开发、类型检查与生产构建 |
| 视图 | React 19 | 页面与组件渲染 |
| 路由 | React Router 7 | `/m` basename、守卫与路由级懒加载 |
| 服务端状态 | TanStack Query 5 | 列表、详情、评论、元数据与 mutation cache |
| 客户端状态 | Zustand | 认证、弹层开关与全局短反馈 |
| 表单 | React Hook Form + Zod | 登录、发布与校验 |
| 模态与菜单 | Radix Dialog + Dropdown Menu | 焦点、Portal、键盘与 aria 语义 |
| 图标 | Lucide React | 用户端与后台的统一线性图标 |
| 样式 | Tailwind CSS 4 | shadcn new-york + neutral 令牌和响应式布局 |

## 3. 路由与壳层

### 3.1 普通用户

| 路由 | 页面 |
|---|---|
| `/m/login` | 校园账号登录与验证码二段提交 |
| `/m/treehole` | 树洞信息流，默认入口 |
| `/m/discover` | 好饭信息流 |
| `/m/messages` | 私信、互动通知与一对一聊天 |
| `/m/me` | 我的 |
| `/m/me/discover` | 我的好饭 |
| `/m/me/treehole` | 我的树洞 |

`MobileTabShell` 在窄屏使用与屏幕底部留有间隔的圆角悬浮 Tab，安全区位于 Tab 外部；宽屏改为简洁侧栏。页面底部间距必须持续避让悬浮 Tab。

帖子详情不增加独立页面，继续用 `postId` 查询参数保持可刷新状态：

- `/m/treehole?postId=12`
- `/m/discover?postId=12`
- `/m/me/treehole?postId=12`

### 3.2 管理后台

| 路由 | 页面 |
|---|---|
| `/m/admin/dashboard` | 业务与运行概览 |
| `/m/admin/users` | 用户检索与分页 |
| `/m/admin/content` | 内容规模与管理入口 |
| `/m/admin/manage/announcements` | 公告管理 |
| `/m/admin/manage/discover` | 好饭内容管理 |
| `/m/admin/manage/treehole` | 树洞与评论管理 |
| `/m/admin/system/settings` | 课表数据源热策略 |
| `/m/admin/system/logs` | 运行日志 |

后台使用独立 HttpOnly Cookie 会话，不与普通用户 Bearer Token 混用。壳层为桌面紧凑工作台，窄屏导航收入可折叠菜单，不删除任何管理能力。

## 4. UI 系统

### 4.1 视觉规则

- 默认色调是 shadcn neutral，主动作使用近黑实心按钮。
- 不使用蓝色作为默认强调，不使用背景渐变、光斑、玻璃拟态或装饰性大阴影。
- 圆角层级只用于卡片、控件、弹窗和悬浮 Tab，禁止无语义的过度圆角。
- 不展示宣传语、AI 式说明、默认规则、重复帮助文案或成功 Toast。
- 只保留页面标题、字段名、必要动作、空态和可操作的失败反馈。

### 4.2 交互原语

| 原语 | 使用边界 |
|---|---|
| `TaskDialog presentation="modal"` | 好饭/树洞发布；居中弹窗、最大 `88dvh`、内部滚动、底部动作固定 |
| `TaskDialog presentation="fullscreen"` | 头像裁切等需要连续操作面积的移动端任务 |
| `BottomSheet` | 详情、编辑资料、确认等短操作；桌面端自动居中 |
| `ActionMenu` | 删除等低频/危险动作，不占据主操作位 |
| `ConfirmSheet` | 不可逆或重要动作的二次确认 |

Radix 负责模态焦点、Esc、Portal 和 aria 语义。`env(safe-area-inset-top/bottom)` 不得从壳层、弹窗或底部导航中移除。

## 5. 评论线程

好饭与树洞使用同一个无请求 `widgets/comment-thread`：

1. 调用方提供平铺评论和 `parentCommentId`。
2. 组件用 `Map` 在客户端组装父子树，缺失父评论的分页数据按主评论容错。
3. 默认只渲染主评论，子孙回复通过“N 条回复”在对应主评论内展开。
4. 回复编辑器显示目标昵称和内容预览，不暴露数据库评论 ID。
5. 查询、写入、删除和缓存更新仍由好饭/树洞各自的 entity hooks 负责。

## 6. 认证与本地持久化

### 6.1 普通用户

`auth-store.ts` 将以下会话写入 `localStorage` 的 `huas-web.auth`：

- `token`
- `userBrief`

登录页的“记住密码”保持当前实现：选中后，成功登录将学号和密码写入 `localStorage` 的 `huas-web.remembered-credentials`，下次打开登录页时直接回填；取消选中则删除该键。

请求层统一注入 `Authorization: Bearer <token>`，收到 `401` 后清理普通用户会话并回到登录页；token 的登录、注销、失效或换号变化会同步清空全部 Query cache 与 Bearer Blob cache，旧身份数据不得跨会话存活。

### 6.2 后台用户

后台账号密码只用于建立服务端 Cookie 会话；页面不持久化后台密码。会话失效事件统一清理后台 Query cache 并回到后台登录态。

## 7. 数据与状态边界

| 状态 | 所属 | 示例 |
|---|---|---|
| 服务端数据 | TanStack Query | 元数据、列表、详情、评论、头像、未读数、后台指标 |
| 瞬时 UI | Zustand | 发布弹窗、编辑资料弹层、当前 Tab、Toast 队列 |
| 可分享页面状态 | URL | `sort`、`category`、`postId` |
| 会话与密码记忆 | localStorage | `huas-web.auth`、`huas-web.remembered-credentials` |

`pages` 只编排路由和页面状态；`widgets` 组合查询与动作；`entities/*/api` 维护领域 HTTP 契约；`shared/api/http-client.ts` 处理 Bearer Token、统一 envelope 和 `401`。页面与组件不得直接写 `fetch`。

## 8. 缓存与失效边界

缓存按资源可变性与隐私边界分层，禁止浏览器 HTTP cache、TanStack Query 和组件本地状态同时拥有同一份失效事实。

| 数据类别 | 存储层 | 新鲜时间 | 保留/失效规则 |
|---|---|---:|---|
| `/m` HTML 与非哈希固定文件 | 浏览器 HTTP cache | 0 秒 | 保存字节但每次以弱 ETag 重验证，确保发布切槽后立即发现新入口 |
| `/m/assets/*` Vite 哈希产物 | 浏览器 HTTP cache | 1 年 | 目录与文件名哈希格式同时命中才声明 `immutable`；URL 内容哈希变化即自然失效，固定文件即使位于 assets 也必须重验证 |
| Discover、Community、首页弹窗版本化公开媒体 | 浏览器 HTTP cache | 1 年 | `immutable`；换内容必须生成新 URL，删除只影响服务端可见性事实 |
| API JSON | TanStack Query 内存 | 60 秒 | 默认 15 分钟无观察者回收，窗口重新聚焦或网络恢复后仅在陈旧时重验证 |
| Discover/Treehole 元数据 | TanStack Query 内存 | 6 小时 | 12 小时无观察者回收；服务端规则仍是最终校验边界 |
| 后台管理快照 | TanStack Query 内存 | 15 秒 | 5 分钟无观察者回收；mutation 成功直接写回或失效对应资源 |
| `refresh=true` 强制刷新 | TanStack Query 在途合并 | 0 秒 | 旁路键 0 秒回收；必须真实访问服务端，成功结果只写回普通资源键 |
| 私信/通知高水位轮询 | TanStack Query 内存 | 等于轮询周期 | 旧游标键保留两周期且至少 30 秒，禁止继承普通查询的分钟级保留时间 |
| Treehole/Messaging 私有图片 | 会话内 Blob LRU | 10 分钟 | 总量 24MB；服务端与 fetch 均 `no-store`，按 URL、认证模式和身份代次隔离 |

API fetch 统一使用 `cache: 'no-store'`，服务端 `/api/*` 与 `/auth/*` 同时返回 `private, no-store`。这是隐私边界，不等于应用不缓存：成功 JSON 由 Query cache 去重、复用与写后失效，私有媒体由 Blob LRU 复用。Query cache 不写入 localStorage，避免敏感内容落盘、跨账号串读和前端版本升级后的旧 schema 恢复。

蓝绿切槽后，已经打开的旧页面可能首次请求一个旧哈希懒 chunk，而新槽只提供新资源图。入口监听 Vite `vite:preloadError`，仅在 sessionStorage 成功写入恢复闸门后，一分钟内至多自动刷新一次；刷新得到经过 ETag 重验证的新 HTML，使入口和 chunk 回到同一发布版本。闸门不可用或新版本自身仍缺 chunk 时错误继续抛出，禁止无限刷新掩盖部署损坏。

轮询只在对应页面分区激活，`refetchIntervalInBackground=false`；窗口重新可见后，TanStack Query 根据新鲜度立即校准。任何新增缓存必须先归类到上表，再定义写入后的精确失效键，不能在页面组件内散落新的时间常量。

## 9. 目录职责

```text
web/src/
├─ app/          # Provider、路由、全局状态和设计令牌
├─ components/   # dither-kit 等外部源码组件边界
├─ entities/     # 领域类型、HTTP 契约、Query Key 与 hooks
├─ features/     # 登录、发布、评分和后台会话等用户动作
├─ pages/        # 路由级页面和后台工作台
├─ shared/       # 无业务语义的 API、配置、工具与 UI 原语
└─ widgets/      # 信息流、弹窗、评论树与个人内容面板
```

普通用户路由级页面懒加载；图片查看器、发布弹窗与资料编辑器按需加载。长列表卡片使用 `content-visibility: auto` 降低屏外渲染成本。

## 10. 验证基线

前端修改至少执行：

```bash
bun run web:typecheck
bun run web:build
```

UI 改动同时检查：

- 320 / 375 / 430 px 手机竖屏。
- 桌面普通用户侧栏。
- 桌面与窄屏管理后台。
- 弹窗内部滚动、焦点、Esc、遮罩和底部固定动作。
- 悬浮 Tab 与页面末尾的避让。
- 评论默认折叠、多级回复展开和删除/回复动作。

[PROTOCOL]: 变更时更新此文档，然后检查对应 AGENTS.md
