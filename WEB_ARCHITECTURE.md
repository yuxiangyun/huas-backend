# HUAS Web 前端架构文档

> 基线日期：2026-03-10
> 当前代码位置：`/Users/xiangyun/Desktop/huas-server/web`
> 当前访问入口：`/m`

## 1. 文档目标

本文档描述 `HUAS Web` 的当前产品边界、前端架构、状态分层、接口接入方式、运行方式和后续扩展约束。

这不是一份纯规划文档，而是以当前已落地实现为基线的维护文档。

## 2. 已确认需求

### 2.1 产品目标

- 在现有 `huas-server` 仓库内新增一个移动端优先的 Web 前端
- 面向移动端用户提供“拍好饭”和“我的”两个核心 Tab
- 前端风格采用 `iOS` 软件设计语言
- 使用现有后端接口，不额外设计平行 API

### 2.2 已确认产品决策

- 业务首页不提供游客态
- 用户必须先登录，才能访问 Discover 与我的页面
- 默认排序使用 `latest`
- 帖子详情采用 `底部弹层`
- 发帖入口放在 Discover 页右下角悬浮按钮，不单独拆第三个 Tab
- “我的”页当前承载资料与我的发布，并预留更多入口区域

### 2.3 已接入接口范围

- `POST /auth/login`
- `GET /api/user`
- `GET /api/discover/meta`
- `GET /api/discover/posts`
- `GET /api/discover/posts/me`
- `GET /api/discover/posts/:id`
- `POST /api/discover/posts`
- `POST /api/discover/posts/:id/rating`
- `DELETE /api/discover/posts/:id`
- `GET /media/discover/*`

## 3. 当前实现状态

当前前端已经完成以下能力：

- `web/` 独立前端工程已建立，使用 `Vite + React + TypeScript + Tailwind CSS`
- 生产构建产物由后端托管到 `/m`
- 登录页已接入真实 `POST /auth/login`
- 已实现验证码二段登录：`needCaptcha + sessionId + captchaImage`
- 已实现 JWT 本地持久化、路由守卫、401 自动回收
- 已实现 401 强制重登后的原页面回跳
- Discover 已接入真实分类、列表、详情、发帖、评分、删除接口
- Discover 列表和“我的发布”都已切到分页加载
- 我的页已接入真实 `/api/user` 和 `/api/discover/posts/me`
- 页面已有全局 Toast、底部详情弹层、发帖弹层、底部 Tab 壳子
- 详情图集和发帖预览图已支持站内图片预览层

当前仍建议继续补强的部分：

- 真人账号浏览器联调与异常流回归
- 更细的空态、网络波动提示和移动端交互打磨
- 后续业务入口接入时的复用组件沉淀

## 4. 技术栈

| 类别 | 当前选型 | 职责 |
|---|---|---|
| 构建 | `Vite 7` | 开发、构建、代理 |
| 视图 | `React 19` | 组件和页面组织 |
| 语言 | `TypeScript` | 类型约束 |
| 路由 | `React Router 7` | 路由、懒加载、登录守卫 |
| 客户端状态 | `Zustand` | 登录态、全局 UI 状态、Toast |
| 服务端状态 | `TanStack Query 5` | 列表、详情、资料查询与缓存失效 |
| 样式 | `Tailwind CSS 4` | 原子样式与设计令牌 |
| 表单 | `React Hook Form` | 登录和发帖表单状态 |
| 校验 | `Zod` | 表单输入约束 |
| 动效 | `motion` | 弹层、Toast、切换动画 |

## 5. 运行与部署

### 5.1 仓库结构

```txt
/Users/xiangyun/Desktop/huas-server
├─ src/                        后端服务
├─ web/                        前端应用
│  ├─ index.html
│  ├─ package.json
│  ├─ vite.config.ts
│  └─ src/
│     ├─ app/
│     ├─ entities/
│     ├─ features/
│     ├─ pages/
│     ├─ shared/
│     └─ widgets/
└─ WEB_ARCHITECTURE.md
```

### 5.2 开发命令

根目录脚本：

- `bun run web:dev`
- `bun run web:build`
- `bun run web:preview`
- `bun run web:typecheck`

前端子应用内部脚本：

- `npm --prefix ./web run dev`
- `npm --prefix ./web run build`
- `npm --prefix ./web run preview`

### 5.3 开发与生产访问方式

- 开发期：Vite 运行在独立端口，`/api`、`/auth`、`/media` 通过代理转发到 Bun 服务
- 生产期：`web/dist` 由后端 `src/index.ts` 托管
- 前端基准路径固定为 `/m`

当前后端已处理以下前端入口：

- `/m`
- `/m/`
- `/m/*`

其中：

- 带文件扩展名的路径按静态资源处理
- 其余路径回退到 `index.html`

## 6. 路由架构

当前路由结构：

- `/m/login`
- `/m/discover`
- `/m/me`

实现方式：

- `createBrowserRouter` 使用 `basename='/m'`
- 业务路由挂在 `MobileTabShell` 下
- 业务壳子外层统一经过 `ProtectedRoute`
- `/m` 默认重定向到 `/m/discover`

帖子详情不单独建子页面，而是使用 URL search params 控制底部弹层：

- `/m/discover?postId=12`

当前 URL 承载的页面状态：

- `sort`
- `category`
- `postId`

这保证了刷新恢复、分享直达和回退行为的稳定性。

## 7. 目录与分层

当前目录已经按业务边界拆分：

```txt
web/src/
├─ app/
│  ├─ bootstrap/               QueryClient 初始化
│  ├─ providers/               全局 Provider 挂载
│  ├─ router/                  路由和守卫
│  ├─ state/                   UI Store / Toast Store
│  └─ styles/                  全局样式和设计令牌
├─ entities/
│  ├─ auth/                    Auth 类型、API、Store
│  ├─ discover/                Discover 类型、API、Query
│  └─ user/                    User 类型、API、Query
├─ features/
│  ├─ auth-login/
│  ├─ discover-create-post/
│  ├─ discover-delete-post/
│  ├─ discover-filter/
│  └─ discover-rate-post/
├─ pages/
│  ├─ login/
│  ├─ discover/
│  └─ me/
├─ shared/
│  ├─ api/                     HTTP client / media helpers
│  ├─ config/                  basename 与环境配置
│  ├─ lib/                     工具函数
│  └─ ui/                      Button / Card / Toast 等通用组件
└─ widgets/
   ├─ mobile-tab-shell/
   ├─ discover-compose-sheet/
   ├─ discover-detail-sheet/
   ├─ discover-feed/
   ├─ my-posts-panel/
   └─ profile-summary/
```

维护约束：

- `pages` 只做路由装配，不直接写请求细节
- `entities/*/api` 负责领域接口
- `entities/*/queries` 负责 Query hooks 和 mutation hooks
- `shared/api/http-client.ts` 统一处理鉴权头和错误归一化
- `shared/ui` 不依赖业务模块

## 8. 状态管理设计

### 8.1 分层原则

状态按三类拆分：

| 类型 | 当前方案 | 示例 |
|---|---|---|
| 客户端状态 | `Zustand` | `token`、`userBrief`、`composeSheetOpen`、Toast 队列 |
| 服务端状态 | `TanStack Query` | 用户资料、Discover Meta、帖子列表、帖子详情 |
| 可分享页面状态 | `URL Search Params` | `sort`、`category`、`postId` |

### 8.2 Zustand 现状

当前已有 Store：

- `auth-store.ts`
  - `token`
  - `userBrief`
  - `isAuthenticated`
  - `login()`
  - `logout()`
  - `restore()`
- `ui-store.ts`
  - `activeTab`
  - `composeSheetOpen`
  - `setActiveTab()`
  - `openComposeSheet()`
  - `closeComposeSheet()`
- `toast-store.ts`
  - `items`
  - `pushToast()`
  - `dismissToast()`

### 8.3 TanStack Query 现状

当前 Query 负责以下数据：

- `discover meta`
- `discover list`
- `discover detail`
- `my discover posts`
- `user info`

当前 Mutation 负责以下动作：

- `create post`
- `rate post`
- `delete post`

缓存规则已落地：

- 发帖成功后失效 Discover 列表和我的发布
- 评分成功后同步更新详情缓存和分页列表缓存
- 删除成功后清理详情缓存并失效相关列表

## 9. 鉴权与登录

### 9.1 登录态守卫

系统不支持游客态，因此所有业务路由都必须经过登录态守卫。

实际流程：

1. 应用启动时从 `localStorage` 恢复 `token`
2. 未登录访问业务页时跳转 `/m/login`
3. 登录后回跳到原本想访问的页面
4. 任意请求返回 `401` 时，统一清理登录态并回到 `/m/login`

### 9.2 登录流程

当前已经对接真实 `POST /auth/login`，支持两种分支：

1. 账号密码直接成功
2. 服务端返回 `needCaptcha=true`

验证码分支当前实现：

- 展示服务端返回的 `captchaImage`
- 保存 `sessionId`
- 要求用户输入验证码再发起第二次提交

### 9.3 Token 存储

- `token` 和 `userBrief` 存在 `localStorage`
- 请求层统一从 `authStore` 读取并注入 `Authorization: Bearer <token>`
- 业务页面不直接读写本地存储

## 10. API 接入方式

### 10.1 请求层分层

当前分层如下：

1. `shared/api/http-client.ts`
   - 封装 `fetch`
   - 注入 Bearer Token
   - 解析统一响应格式
   - 归一化业务错误
   - 处理 401 回登录
2. `entities/*/api/*.ts`
   - 定义领域接口函数
3. `entities/*/api/*-queries.ts`
   - 封装 Query / Mutation hooks

### 10.2 Discover 接入矩阵

| 功能 | 接口 | 当前落点 |
|---|---|---|
| 元信息 | `GET /api/discover/meta` | 分类、常用标签、限制 |
| 列表 | `GET /api/discover/posts` | Discover 主列表，支持分页与筛选 |
| 我的发布 | `GET /api/discover/posts/me` | 我的页列表，支持分页 |
| 详情 | `GET /api/discover/posts/:id` | 底部详情弹层 |
| 发布 | `POST /api/discover/posts` | 发帖弹层，`multipart/form-data` |
| 评分 | `POST /api/discover/posts/:id/rating` | 详情弹层评分条 |
| 删除 | `DELETE /api/discover/posts/:id` | 详情弹层删除动作 |

### 10.3 User 接入矩阵

| 功能 | 接口 | 当前落点 |
|---|---|---|
| 个人资料 | `GET /api/user` | 我的页资料卡 |
| 强制刷新资料 | `GET /api/user?refresh=true` | “我的”页全部刷新 |

## 11. 页面设计与实现方式

### 11.1 登录页

当前能力：

- 学号输入
- 密码输入
- 验证码展示与输入
- 验证码重新获取
- 错误提示
- 登录后回跳

实现方式：

- `React Hook Form + Zod`
- Mutation 直连真实登录接口
- 登录成功后预取 `discoverMeta` 和 `userInfo`

### 11.2 Discover 页

当前能力：

- 顶部大标题
- 分类筛选
- 排序切换
- 实时列表
- 底部详情弹层
- 右下角发帖按钮
- 顶部刷新

实现方式：

- 页面状态由 `URL Search Params` 维护
- 列表走 `useInfiniteQuery`
- 详情通过 `postId` 控制打开
- 发帖弹层由 `ui-store` 控制

### 11.3 发帖弹层

当前能力：

- 分类选择
- 标题输入
- 常用标签选择
- 自定义标签输入
- 多图上传
- 本地图片预览
- 预览图放大查看
- 标签和图片数量限制提示

实现方式：

- 表单使用 `React Hook Form + Zod`
- 图片通过 `FormData` 提交
- 发帖成功后关闭弹层、刷新列表、弹出 Toast

### 11.4 详情弹层

当前能力：

- 帖子详情拉取
- 图片展示
- 站内图片预览
- 评分
- 删除自己的帖子
- 错误提示与成功 Toast

实现方式：

- 根据 `postId` 请求详情
- 评分 Mutation 成功后同步详情和列表缓存
- 删除 Mutation 成功后关闭弹层并失效列表

### 11.5 我的页

当前能力：

- 用户信息卡片
- 我的发布列表
- 全部刷新
- 退出登录
- 后续入口预留区

当前扩展预留方向：

- 课表
- 成绩
- 一卡通
- 设置
- 反馈

## 12. UI 系统与交互原则

当前样式系统已经基于 Tailwind v4 的主题变量落地：

- `--color-shell`
- `--color-card`
- `--color-card-strong`
- `--color-tint`
- `--radius-card`
- `--radius-pill`
- `--shadow-card`
- `--shadow-glass`

当前视觉策略：

- 移动端优先，最大内容宽度约 `430px`
- 大标题 + 次级说明
- 卡片化信息流
- 毛玻璃底部 Tab
- 强调 `safe-area` 适配
- 浅色暖调背景，避免默认白底紫色方案

当前已沉淀的通用 UI：

- `Button`
- `Card`
- `ImageViewer`
- `ToastViewport`

后续适合继续沉淀的组件：

- `EmptyState`
- `ErrorState`
- `Sheet`

## 13. 测试与验证

当前至少做过以下验证：

- `bun run build` in `web/`
- `bunx tsc --noEmit` in repo root
- `/m` 与 `/m/assets/*` 本地 HTTP 返回验证
- Vite 开发态 `/m/` 路由返回验证

当前仍缺少的验证：

- 真实学校账号浏览器联调
- 真实验证码分支全链路回归
- 发布、评分、删除的浏览器端交互验收

## 14. 维护约束

- 新增页面状态时，先判断是否应放进 URL，而不是直接塞进 Store
- 不要把服务端列表和详情缓存迁回 Zustand
- 页面组件里不要直接写 `fetch`
- 新增业务模块时，优先复用 `entities + features + widgets` 分层
- 所有业务请求统一走 `shared/api/http-client.ts`
- `/m` 是当前固定前端入口，除非全链路调整，否则不要随意改基准路径

## 15. 下一步建议

从当前基线继续推进，优先级建议是：

1. 完成浏览器真人联调和异常态修正
2. 继续打磨移动端交互，例如图集预览、空态、加载态
3. 为“我的”页后续服务入口预留复用卡片组件
4. 新业务接入时保持同一套请求层和状态分层，不再重复造状态容器
