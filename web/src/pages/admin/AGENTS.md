# admin/
> L2 | 父级: /Users/xiangyun/workspace/huas-wechat-app/huas-server/web/src/pages/AGENTS.md

成员清单
announcements.tsx: 公告创建、编辑、删除与列表管理页
compliance.tsx: Discover/Treehole 合规模式和纯文本替代内容设置页
content.tsx: 内容规模摘要与各管理面的导航页
dashboard.tsx: 业务趋势、用户分布及数据库/进程/缓存运行状态总览页
discover.tsx: Discover 帖子检索、详情与管理删除页
layout.tsx: 后台 Cookie 会话、登录、响应式导航与失效清理壳
logs.tsx: PM2 日志筛选、定时刷新与桌面表格页
treehole.tsx: Treehole 帖子、评论检索及管理删除页
users.tsx: 用户搜索、专业/年级筛选与分页页

架构决策
后台页面只消费 entities/admin 的 TanStack Query 契约；互不依赖的查询在渲染时并发启动，运行状态复用 Dashboard 已有字段，不直接解析 Prometheus 文本。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
