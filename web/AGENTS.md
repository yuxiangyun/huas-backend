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
src/features/: 登录、发布、筛选与后台会话等用户动作。
src/pages/: `/m` 普通用户页面与 `/m/admin` 后台页面。
src/components/: 外部源码 UI 组件边界，当前承载 dither-kit 图表原语。
src/shared/: HTTP、配置、工具和无业务语义的基础 UI。
src/widgets/: 跨页面组合组件与移动端交互容器。

架构决策
普通用户与后台共享 Vite 产物和设计令牌，但使用独立路由壳与认证边界；后台位于 `/m/admin/*`，保持桌面优先且完整响应式。
普通用户根入口与无来源登录默认进入树洞；桌面侧栏和移动底部 Tab 统一按树洞、好饭、消息、我的排列，消息徽标聚合私信与活动通知未读。
后台系统设置以 `/m/admin/system/settings` 为 canonical，只承载仍在使用的课表来源策略。
普通用户与后台页面均按路由懒加载；Social 首屏不下载后台图表、管理表格和会话代码。
后台菜单使用 canonical 文档导航；后台路由模块与普通用户 Social 包物理分离。
dither-kit 以源码组件落入 `src/components/dither-kit/`，业务页面只消费公开图表部件，不修改内部绘制协议。
Discover 与 Treehole 保留各自数据和幂等点赞语义；同构的评论编辑、父子树组装、折叠回复与分页展示统一复用 `widgets/comment-thread` 无请求组件。
Community 是 Social 公共资料唯一前端实体：昵称和头像统一作用于 Discover、Treehole、Messaging 与 Notifications，内容与活动实体只引用公共人物契约，不保存资料快照。
Messaging 与 Notifications 是独立读模型：会话/消息按 lastMessageId 高水位增量刷新，活动通知按 notificationId 高水位增量刷新并只允许逐条已读；私信媒体按 URL/认证模式去重请求并转为引用计数 Blob URL。
Community 公共用户详情聚合指定用户的 Discover/Treehole 内容，并作为帖子、评论、通知 actor 进入私信的统一入口；后台另有 Cookie 会话保护的私信只读审计页。
登录表单在用户选择“记住密码”时，将学号与密码写入 `localStorage`，下次登录从同一键恢复。
登录表单区分 CAS 密码拒绝与验证码失败：挑战响应展示具体原因，密码错误时退出已消费的验证码会话、清除失效记忆值并聚焦密码字段。
普通用户 UI 采用 shadcn new-york + neutral 语言：禁用蓝色默认强调、渐变、玻璃拟态与宣传文案；Treehole 使用 Instagram 式高对比白色单面板分隔信息流，好饭使用紧凑横向媒体卡，聊天气泡限制内容宽度。

开发规范
新增页面先更新路由与本地图；业务文件维持 INPUT/OUTPUT/POS 头部契约。
后台文案只描述事实、范围和动作，禁用拟人化、营销化与 AI 式推断文案。
响应式不删除能力：窄屏重排图表，宽表转换为摘要卡片或详情视图。

变更日志
2026-07-31: 按校园社区原型重建普通用户 Social 前端，新增私信、活动通知、聊天与四 Tab 壳，移除演示说明和超大气泡布局。
2026-07-31: 删除 Discover 评分、Treehole 资料兼容组件与旧通知接口，统一 Community 作者、幂等点赞及服务端新契约。
2026-07-31: 后台改为路由级动态加载并同步 Discover 点赞、Treehole 公共作者管理契约，Social 首屏不再包含图表包。
2026-07-31: 补齐公共用户内容、作者资料入口、私信定位/幂等重试、媒体去重缓存及后台私信只读审计，覆盖 Social API 基线。
2026-07-29: 登录页保留 CAS 验证码失败原因，密码错误时清理已消费挑战，终止无效验证码循环。
2026-07-29: Treehole 信息流、详情、评论、个人动态与资料弹层统一将缺省昵称显示为“匿名用户”。
2026-07-29: 全站统一 shadcn neutral 视觉与极简文案；发布改为居中弹窗，树洞资料入口改为图标加文字，移动导航改为圆角悬浮 Tab。
2026-07-29: 评论从平铺卡片改为父子树，默认只显示主评论，回复在对应主评论内按需展开。
2026-07-29: 新增统一“编辑资料”弹层与双社区昵称/头像投影；树洞详情改为评论在上、编辑器按需展开并移除尾部文案。
2026-07-29: 普通用户默认入口切换至 Treehole，交换 Treehole/Discover 主导航顺序，并移除两个信息流无后续分页时的“已经到底了”标签。
2026-07-29: 普通用户壳完成移动/桌面视觉回归：清除可点击卡片的原生矩形底板，收紧长文本与 grid 最小宽度，修复个人页操作按钮裁切，移除个人入口的冗余标签/右侧装饰 icon，并使移动弹层不透出底部导航。
2026-07-31: 后台设置边界收敛至 Academic 课表来源策略，并移除失效协议与路由。
2026-07-27: 后台总览接入既有数据库、进程、内存、缓存与凭证遥测，不新增请求瀑布或运行 API。
2026-07-18: 按评论交互语义抽出 comment-thread，Discover/Treehole 详情容器继续独立持有业务判断。
2026-07-13: 后台菜单改为确定性文档导航，修复桌面与移动端点击后必须手动刷新的问题。
2026-07-12: 修复后台动态 chunk 导航失效，菜单按概览、用户、内容管理、系统语义分组。
2026-07-12: 播种 Web L2 地图，确立 `/m/admin` 独立后台、路由懒加载与 dither-kit 边界。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
