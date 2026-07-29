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
普通用户根入口与无来源登录默认进入树洞；桌面侧栏和移动悬浮 Tab 均按树洞、好饭、我的排列，导航顺序与默认语义保持一致。
后台系统设置以 `/m/admin/system/settings` 为 canonical，只承载仍在使用的课表来源策略；历史 `/m/admin/system/compliance` 仅做 replace 重定向，不保留重复实现。
普通用户页面按路由懒加载；后台页面随后台壳一次加载，避免发布切换或移动网络造成动态 chunk 导航失效。
后台菜单使用服务端可回退的文档导航，规避部分桌面浏览器与移动 WebView 中 history 已变化但 Outlet 未提交的失效状态。
dither-kit 以源码组件落入 `src/components/dither-kit/`，业务页面只消费公开图表部件，不修改内部绘制协议。
Discover 与 Treehole 保留各自数据和 mutation 语义；同构的评论编辑、父子树组装、折叠回复与分页展示统一复用 `widgets/comment-thread` 无请求组件。
Web 社区资料由用户表实时投影：昵称同时作用于 Discover/Treehole，头像按存在性在 Discover 展示、在 Treehole 提供匿名占位；内容表不保存资料快照。
登录表单在用户选择“记住密码”时，将学号与密码写入 `localStorage`，下次登录从同一键恢复。
普通用户 UI 采用 shadcn new-york + neutral 语言：禁用蓝色默认强调、渐变、玻璃拟态与宣传文案；发布使用居中弹窗，短操作使用底部弹层，只显示必要动作与失败反馈。

开发规范
新增页面先更新路由与本地图；业务文件维持 INPUT/OUTPUT/POS 头部契约。
后台文案只描述事实、范围和动作，禁用拟人化、营销化与 AI 式推断文案。
响应式不删除能力：窄屏重排图表，宽表转换为摘要卡片或详情视图。

变更日志
2026-07-29: 全站统一 shadcn neutral 视觉与极简文案；发布改为居中弹窗，树洞资料入口改为图标加文字，移动导航改为圆角悬浮 Tab。
2026-07-29: 评论从平铺卡片改为父子树，默认只显示主评论，回复在对应主评论内按需展开。
2026-07-29: 新增统一“编辑资料”弹层与双社区昵称/头像投影；树洞详情改为评论在上、编辑器按需展开并移除尾部文案。
2026-07-29: 后台设置页移除不再面向管理人员的 UGC 读取改写开关，Discover/Treehole 前台与内容管理页保持不变。
2026-07-29: 普通用户默认入口切换至 Treehole，交换 Treehole/Discover 主导航顺序，并移除两个信息流无后续分页时的“已经到底了”标签。
2026-07-29: 普通用户壳完成移动/桌面视觉回归：清除可点击卡片的原生矩形底板，收紧长文本与 grid 最小宽度，修复个人页操作按钮裁切，移除个人入口的冗余标签/右侧装饰 icon，并使移动弹层不透出底部导航。
2026-07-28: “合规设置”升级为“设置”，并入课表 JW/Portal 来源热策略；设置查询并发、错误隔离，旧路径保持重定向兼容。
2026-07-27: 后台总览接入既有数据库、进程、内存、缓存与凭证遥测，不新增请求瀑布或运行 API。
2026-07-18: 按评论交互语义抽出 comment-thread，Discover/Treehole 详情容器继续独立持有业务判断。
2026-07-13: 后台菜单改为确定性文档导航，修复桌面与移动端点击后必须手动刷新的问题。
2026-07-12: 修复后台动态 chunk 导航失效，菜单按概览、用户、内容管理、系统语义分组。
2026-07-12: 播种 Web L2 地图，确立 `/m/admin` 独立后台、路由懒加载与 dither-kit 边界。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
