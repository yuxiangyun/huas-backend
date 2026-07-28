# web/
> L2 | 父级: /Users/xiangyun/workspace/huas-wechat-app/huas-server/AGENTS.md

成员清单
index.html: Vite HTML 入口，挂载 React SPA。
package.json: React 19、Vite、Tailwind 与前端依赖脚本入口。
components.json: shadcn 源码组件注册配置，将 dither-kit 定位到 shared/ui。
vite.config.ts: `/m/` 基路径、路径别名与开发代理配置。
tsconfig.json: Web TypeScript 编译边界与 `@/*` 别名。
src/main.tsx: React 应用启动入口，加载全局样式与 Provider。
src/app/: 路由、全局状态、Provider 与样式等应用骨架。
src/entities/: 业务实体的 API、查询缓存与类型契约。
src/features/: 登录、发布、评分与后台会话等用户动作。
src/pages/: `/m` 普通用户页面与 `/m/admin` 后台页面。
src/components/: 外部源码 UI 组件边界，当前承载 dither-kit 图表原语。
src/shared/: HTTP、配置、工具和无业务语义的基础 UI。
src/widgets/: 跨页面组合组件与移动端交互容器。

架构决策
普通用户与后台共享 Vite 产物和设计令牌，但使用独立路由壳与认证边界；后台位于 `/m/admin/*`，保持桌面优先且完整响应式。
后台系统设置以 `/m/admin/system/settings` 为 canonical，历史 `/m/admin/system/compliance` 仅做 replace 重定向，不保留重复实现。
普通用户页面按路由懒加载；后台页面随后台壳一次加载，避免发布切换或移动网络造成动态 chunk 导航失效。
后台菜单使用服务端可回退的文档导航，规避部分桌面浏览器与移动 WebView 中 history 已变化但 Outlet 未提交的失效状态。
dither-kit 以源码组件落入 `src/components/dither-kit/`，业务页面只消费公开图表部件，不修改内部绘制协议。
Discover 与 Treehole 保留各自数据和 mutation 语义；同构的评论编辑、回复、列表状态与分页展示统一复用 `widgets/comment-thread` 无请求组件。

开发规范
新增页面先更新路由与本地图；业务文件维持 INPUT/OUTPUT/POS 头部契约。
后台文案只描述事实、范围和动作，禁用拟人化、营销化与 AI 式推断文案。
响应式不删除能力：窄屏重排图表，宽表转换为摘要卡片或详情视图。

变更日志
2026-07-28: “合规设置”升级为“设置”，并入课表 JW/Portal 来源热策略；设置查询并发、错误隔离，旧路径保持重定向兼容。
2026-07-27: 后台总览接入既有数据库、进程、内存、缓存与凭证遥测，不新增请求瀑布或运行 API。
2026-07-18: 按评论交互语义抽出 comment-thread，Discover/Treehole 详情容器继续独立持有业务判断。
2026-07-13: 后台菜单改为确定性文档导航，修复桌面与移动端点击后必须手动刷新的问题。
2026-07-12: 修复后台动态 chunk 导航失效，菜单按概览、用户、内容管理、系统语义分组。
2026-07-12: 播种 Web L2 地图，确立 `/m/admin` 独立后台、路由懒加载与 dither-kit 边界。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
