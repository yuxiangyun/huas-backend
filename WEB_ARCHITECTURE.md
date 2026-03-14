# HUAS Web 前端架构文档

> 基线日期：2026-03-14
> 当前代码位置：`/Users/xiangyun/Desktop/huas-server/web`
> 当前线上入口：`/m`

## 1. 文档目标

本文档只描述当前已经落地的前端实现，不记录已经废弃的设计稿。

目标是让后续维护者直接回答三件事：

1. 现在有哪些真实页面和路由
2. 状态、请求和 UI 分层是怎么组织的
3. 哪些文档约束仍然有效，哪些实现已经变化

## 2. 当前产品边界

当前 Web 前端仍然是移动端优先的校园应用，主业务覆盖 Discover、Treehole 与账号入口。

已落地的页面角色：

- 登录页：统一认证登录与验证码二段提交
- Discover 页：浏览、筛选、打开详情、发帖
- Treehole 页：浏览匿名流、打开详情、发帖
- 我的页：作为账号与业务入口页，不再直接承载资料卡和内容列表
- 我的 Discover 页：承载发布概览和我的帖子列表
- 我的 Treehole 页：承载树洞概览和我的树洞列表
- 管理后台：按子路由拆分总览、公告、Discover、Treehole、日志

当前不支持游客态：

- 未登录用户只能访问 `/m/login`
- 普通业务路由经过 `ProtectedRoute`
- 管理路由 `/m/admin/*` 由管理员 Basic Auth 单独鉴权

## 3. 技术栈

| 类别 | 当前选型 | 职责 |
|---|---|---|
| 构建 | `Vite 7` | 开发、构建、代理 |
| 视图 | `React 19` | 页面与组件渲染 |
| 语言 | `TypeScript` | 类型约束 |
| 路由 | `React Router 7` | 路由、懒加载、守卫 |
| 客户端状态 | `Zustand` | 登录态、UI 状态、Toast |
| 服务端状态 | `TanStack Query 5` | 列表、详情、元信息缓存 |
| 表单 | `React Hook Form` | 登录与发帖表单 |
| 校验 | `Zod` | 表单约束 |
| 样式 | `Tailwind CSS 4` | 设计令牌与原子样式 |
| 动效 | `motion` | 底部弹层、Toast、过渡动画 |

## 4. 运行方式

开发与生产都基于 `/m`：

- 开发期：Vite 独立端口运行，`/api`、`/auth`、`/media` 走代理
- 生产期：后端直接托管 `web/dist`

后端已处理：

- `/m`
- `/m/`
- `/m/*`

规则：

- 带文件扩展名的路径按静态资源处理
- 其余路径回退到前端 `index.html`

## 5. 当前真实路由

当前路由结构：

- `/m/login`
- `/m/discover`
- `/m/treehole`
- `/m/me`
- `/m/me/discover`
- `/m/me/treehole`
- `/m/admin`
- `/m/admin/dashboard`
- `/m/admin/announcements`
- `/m/admin/discover`
- `/m/admin/treehole`
- `/m/admin/logs`

实现方式：

- `createBrowserRouter` 使用 `basename='/m'`
- 登录页单独挂载
- 业务页统一挂在 `MobileTabShell` 下
- `ProtectedRoute` 负责登录态守卫
- `/m` 默认重定向到 `/m/discover`

帖子详情不单独建页面，继续使用 query 参数控制底部弹层：

- `/m/discover?postId=12`
- `/m/treehole?postId=12`
- `/m/me/treehole?postId=12`

当前 URL 承载的页面状态：

- `sort`
- `category`
- `postId`

## 6. 页面职责

### 6.1 登录页

文件：

- `web/src/pages/login/index.tsx`
- `web/src/features/auth-login/ui/login-form.tsx`

当前能力：

- 学号登录
- 密码登录
- 验证码挑战展示
- 验证码重新获取
- 登录后按来源路由回跳
- 登录成功后预取 `discover meta`

视觉上，登录页现在使用 `PageHero + LoginForm` 的组合，而不是原先双栏宣传布局。

### 6.2 Discover 页

文件：

- `web/src/pages/discover/index.tsx`
- `web/src/widgets/discover-feed/discover-feed.tsx`
- `web/src/features/discover-filter/ui/discover-controls.tsx`

当前能力：

- 排序切换：`最新 / 高分 / 推荐`
- 分类筛选
- 打开帖子详情
- 刷新列表
- 打开发帖弹层

实现变化：

- 发帖入口不再是页面右下角悬浮按钮
- 现在集成在 Discover 顶部筛选控件区，和排序控件同排显示

### 6.3 发帖弹层

文件：

- `web/src/widgets/discover-compose-sheet/discover-compose-sheet.tsx`

当前能力：

- 分类、标题、档口、价格、推荐说明
- 常用标签 + 自定义标签
- 多图上传
- 图片本地预览
- 数量与长度限制提示

弹层状态放在 `ui-store` 中：

- `composeSheetOpen`
- `openComposeSheet()`
- `closeComposeSheet()`

### 6.4 详情弹层

文件：

- `web/src/widgets/discover-detail-sheet/discover-detail-sheet.tsx`
- `web/src/shared/ui/image-viewer.tsx`

当前能力：

- 拉取帖子详情
- 展示图片与站内预览
- 评分
- 删除自己的帖子
- 操作结果提示

详情弹层由 `postId` URL 参数控制，而不是单独的本地布尔状态。

### 6.5 Treehole 页

文件：

- `web/src/pages/treehole/index.tsx`
- `web/src/widgets/treehole-feed/treehole-feed.tsx`

当前能力：

- 浏览最新树洞列表
- 打开树洞详情
- 刷新列表
- 打开发帖弹层
- 打开树洞头像弹层（上传/删除）

### 6.6 Treehole 弹层

文件：

- `web/src/widgets/treehole-compose-sheet/treehole-compose-sheet.tsx`
- `web/src/widgets/treehole-detail-sheet/treehole-detail-sheet.tsx`
- `web/src/widgets/treehole-avatar-sheet/treehole-avatar-sheet.tsx`

当前能力：

- 发布树洞
- 查看树洞详情
- 点赞 / 取消点赞
- 单层评论与删除自己的评论
- 删除自己的树洞
- 上传、裁切、删除树洞头像

### 6.7 我的页

文件：

- `web/src/pages/me/index.tsx`

当前页角色已经变化：

- 它现在是“入口页”
- 不再直接展示资料卡
- 不再直接展示内容列表

当前只保留三类动作：

- 进入“拍好饭”子页面
- 进入“树洞”子页面
- 退出登录

补充：

- “我的”页当前会读取 `GET /api/treehole/avatar`，将树洞头像同步展示在账号入口卡片中

### 6.8 我的 Discover 页

文件：

- `web/src/pages/me-discover/index.tsx`
- `web/src/widgets/my-posts-panel/my-posts-panel.tsx`

当前能力：

- 发布概览统计
- 我的帖子分页列表
- 刷新我的列表
- 加载更多
- 点击帖子跳回 Discover 详情

这部分是原先“我的”页中 Discover 区域的拆分结果。

### 6.9 我的 Treehole 页

文件：

- `web/src/pages/me-treehole/index.tsx`
- `web/src/widgets/my-treehole-posts-panel/my-treehole-posts-panel.tsx`

当前能力：

- 树洞概览统计
- 我的树洞分页列表
- 刷新我的树洞列表
- 点击树洞直接打开详情弹层

这部分是“树洞”内容的个人管理页。

### 6.10 管理后台

文件：

- `web/src/pages/admin/layout.tsx`
- `web/src/pages/admin/{dashboard,announcements,discover,treehole,logs}.tsx`

当前能力：

- 管理员 Basic Auth 登录与会话持久化
- Dashboard 总览（指标、分布、用户筛选分页）
- 公告增删改
- Discover 列表与删帖、图片预览
- Treehole 列表/评论查看与删帖删评
- 终端日志过滤、限额、自动刷新

## 7. 目录与分层

当前目录结构：

```txt
web/src/
├─ app/
│  ├─ bootstrap/
│  ├─ providers/
│  ├─ router/
│  ├─ state/
│  └─ styles/
├─ entities/
│  ├─ admin/
│  ├─ auth/
│  ├─ discover/
│  ├─ treehole/
│  └─ user/
├─ features/
│  ├─ admin-treehole/
│  ├─ auth-login/
│  ├─ discover-create-post/
│  ├─ discover-delete-post/
│  ├─ discover-filter/
│  ├─ discover-rate-post/
│  └─ treehole-create-post/
├─ pages/
│  ├─ admin/
│  ├─ login/
│  ├─ discover/
│  ├─ me/
│  ├─ me-discover/
│  ├─ me-treehole/
│  └─ treehole/
├─ shared/
│  ├─ api/
│  ├─ config/
│  ├─ lib/
│  └─ ui/
└─ widgets/
   ├─ mobile-tab-shell/
   ├─ discover-compose-sheet/
   ├─ discover-detail-sheet/
   ├─ discover-feed/
   ├─ my-posts-panel/
   ├─ my-treehole-posts-panel/
   ├─ treehole-compose-sheet/
   ├─ treehole-detail-sheet/
   ├─ treehole-feed/
   └─ profile-summary/
```

分层约束：

- `pages` 只做路由与页面级装配
- `entities/*/api` 定义领域接口
- `entities/*/api/*-queries.ts` 负责 Query / Mutation hooks
- `shared/api/http-client.ts` 统一注入 Bearer Token 和处理 401
- `shared/ui` 不依赖业务模块

## 8. 状态设计

状态继续分三类：

| 类型 | 当前方案 | 示例 |
|---|---|---|
| 客户端状态 | `Zustand` | `token`、`userBrief`、`discoverComposeSheetOpen`、`treeholeComposeSheetOpen`、`treeholeAvatarSheetOpen`、Toast 队列 |
| 服务端状态 | `TanStack Query` | Discover / Treehole 的 meta、列表、详情、评论、我的内容、头像、未读提醒 |
| 可分享页面状态 | `URL Search Params` | `sort`、`category`、`postId` |

### 8.1 Auth Store

`auth-store.ts` 当前维护：

- `token`
- `userBrief`
- `isAuthenticated`
- `login()`
- `logout()`
- `restore()`

`token` 和 `userBrief` 会持久化到 `localStorage`。

### 8.2 UI Store

`ui-store.ts` 当前维护：

- `activeTab`
- `discoverComposeSheetOpen`
- `treeholeComposeSheetOpen`
- `treeholeAvatarSheetOpen`
- `setActiveTab()`
- `openDiscoverComposeSheet()`
- `closeDiscoverComposeSheet()`
- `openTreeholeComposeSheet()`
- `closeTreeholeComposeSheet()`
- `openTreeholeAvatarSheet()`
- `closeTreeholeAvatarSheet()`

### 8.3 Toast Store

`toast-store.ts` 当前维护：

- `items`
- `pushToast()`
- `dismissToast()`

## 9. 请求层设计

当前请求层仍是三层：

1. `shared/api/http-client.ts`
2. `entities/*/api/*.ts`
3. `entities/*/api/*-queries.ts`

`shared/api/http-client.ts` 负责：

- 注入 `Authorization: Bearer <token>`
- 处理表单和 JSON 请求
- 解析统一响应 envelope
- `401` 时清理登录态并回登录页

## 10. 当前 API 使用矩阵

### 10.1 Discover

| 功能 | 接口 | 当前页面/组件 |
|---|---|---|
| 元信息 | `GET /api/discover/meta` | Discover 页、发帖弹层 |
| 列表 | `GET /api/discover/posts` | Discover 页 |
| 我的帖子 | `GET /api/discover/posts/me` | `/m/me/discover` |
| 详情 | `GET /api/discover/posts/:id` | 详情弹层 |
| 发帖 | `POST /api/discover/posts` | 发帖弹层 |
| 评分 | `POST /api/discover/posts/:id/rating` | 详情弹层 |
| 删除 | `DELETE /api/discover/posts/:id` | 详情弹层 |

### 10.2 Treehole

| 功能 | 接口 | 当前页面/组件 |
|---|---|---|
| 元信息 | `GET /api/treehole/meta` | 树洞发帖弹层、评论输入约束 |
| 我的头像 | `GET /api/treehole/avatar` | 树洞头像弹层、我的页头像展示 |
| 上传头像 | `POST /api/treehole/avatar` | 树洞头像弹层 |
| 删除头像 | `DELETE /api/treehole/avatar` | 树洞头像弹层 |
| 未读提醒数 | `GET /api/treehole/notifications/unread-count` | `/m/me`、`/m/treehole`、`/m/me/treehole` |
| 全部已读 | `POST /api/treehole/notifications/read-all` | `/m/treehole`、`/m/me/treehole` 进入时触发 |
| 列表 | `GET /api/treehole/posts` | `/m/treehole` |
| 我的树洞 | `GET /api/treehole/posts/me` | `/m/me/treehole` |
| 详情 | `GET /api/treehole/posts/:id` | 树洞详情弹层 |
| 发帖 | `POST /api/treehole/posts` | 树洞发帖弹层 |
| 点赞 | `PUT /api/treehole/posts/:id/like` | 树洞详情弹层 |
| 取消点赞 | `DELETE /api/treehole/posts/:id/like` | 树洞详情弹层 |
| 评论列表 | `GET /api/treehole/posts/:id/comments` | 树洞详情弹层 |
| 评论 | `POST /api/treehole/posts/:id/comments` | 树洞详情弹层 |
| 删除帖子 | `DELETE /api/treehole/posts/:id` | 树洞详情弹层 |
| 删除评论 | `DELETE /api/treehole/comments/:id` | 树洞详情弹层 |
| 头像媒体 | `GET /media/treehole-avatar/*` | `TreeholeAvatar` 组件 `<img>` 直接访问 |

### 10.3 User

`GET /api/user` 当前仍然有 API 与 Query 层封装，但现状是：

- 当前路由页面没有直接展示个人资料卡

这意味着：

- `user` 领域层还在
- 但 UI 层当前没有直接消费它来渲染“我的”页

## 11. 鉴权与登录流程

### 11.1 守卫

业务路由统一受保护：

1. 启动时从 `localStorage` 恢复 token
2. 未登录访问业务页时跳转 `/m/login`
3. 登录成功后按来源路由回跳
4. 任何请求返回 `401` 时，统一清理登录态并回登录页

### 11.2 验证码分支

登录接口支持两段式流程：

1. 提交学号和密码
2. 如果服务端要求验证码，展示 `captchaImage`
3. 保存 `sessionId`
4. 用户输入验证码后再次提交

## 12. UI 系统

当前前端已经沉淀的共享 UI 包括：

- `Button`
- `IconButton`
- `Card`
- `PageHeader`
- `PageHero`
- `BottomSheet`
- `SegmentedControl`
- `FilterChip`
- `ImageViewer`
- `ToastViewport`

### 12.1 当前视觉方向

目前主题已经从早期暖色方案切到更冷静的浅色系统：

- shell 背景偏灰蓝
- 卡片是半透明浅底
- 主强调色以深色文本和深色按钮为主
- 移动端底部 Tab 缩成中间 dock，而不是铺满整宽

### 12.2 Safe Area

样式系统仍大量依赖 CSS 变量处理：

- `safe-area-inset-top`
- `safe-area-inset-bottom`
- `--space-shell-bottom`
- `--space-tab-bottom`

这部分不要随意移除，否则 iPhone 底部区域会退化。

## 13. 已知遗留与说明

### 13.1 `ProfileSummary` 组件仍在仓库中

`widgets/profile-summary/profile-summary.tsx` 目前仍存在，但当前真实页面不再使用它。

它现在更像是保留实现，不是当前活跃 UI。

### 13.2 `useUserInfoQuery` 仍存在

`entities/user/api/user-queries.ts` 仍然保留，但当前登录流程不再主动预取，且“我的”页也不直接消费这份数据。

如果未来重新恢复资料卡展示，可以继续复用这一层。

## 14. 当前验证基线

至少已确认：

- `npm run typecheck` 通过
- `npm run build` 通过
- `/m` 路由由后端正确托管
- `/m/me/discover` 已进入真实路由树
- `/m/treehole` 与 `/m/me/treehole` 已进入真实路由树

仍建议继续补强：

- 真人账号浏览器联调
- 验证码全链路回归
- 移动端交互与空态打磨

## 15. 维护约束

- 新增页面状态时，优先判断是否应进入 URL
- 不要把服务端列表缓存迁回 Zustand
- 页面组件里不要直接写 `fetch`
- 所有业务请求统一走 `shared/api/http-client.ts`
- `/m` 是固定前端入口，除非全链路调整，不要随意改 basename
