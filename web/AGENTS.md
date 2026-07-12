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
普通用户页面按路由懒加载；后台页面随后台壳一次加载，避免发布切换或移动网络造成动态 chunk 导航失效。
dither-kit 以源码组件落入 `src/components/dither-kit/`，业务页面只消费公开图表部件，不修改内部绘制协议。

开发规范
新增页面先更新路由与本地图；业务文件维持 INPUT/OUTPUT/POS 头部契约。
后台文案只描述事实、范围和动作，禁用拟人化、营销化与 AI 式推断文案。
响应式不删除能力：窄屏重排图表，宽表转换为摘要卡片或详情视图。

变更日志
2026-07-12: 修复后台动态 chunk 导航失效，菜单按概览、用户、内容管理、系统语义分组。
2026-07-12: 播种 Web L2 地图，确立 `/m/admin` 独立后台、路由懒加载与 dither-kit 边界。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
