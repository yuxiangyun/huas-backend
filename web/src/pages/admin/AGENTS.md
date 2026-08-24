# admin/
> L2 | 父级: /Users/xiangyun/workspace/huas-wechat-app/huas-server/web/src/pages/AGENTS.md

成员清单
announcements.tsx: 公告创建、编辑、删除与列表管理页
content.tsx: 内容规模摘要与各管理面的导航页
dashboard.tsx: 业务趋势、用户分布及数据库/进程/缓存运行状态总览页
discover.tsx: Discover 帖子检索、详情与管理删除页
early-rising-settings.tsx: Early Rising 展示设置区块，控制小程序排行榜个人资料入口并展示最后修改审计
index-popup-settings.tsx: 首页弹窗单配置区块，维护海报上传预览、底部动作三态与文案草稿、启停、展示频率及可选时间窗口
layout.tsx: 后台 Cookie 会话、登录、响应式导航、失效处理与身份切换时的 Cookie 私有媒体缓存清理壳
logs.tsx: PM2 日志筛选、定时刷新与桌面表格页
schedule-source-policy-settings.tsx: JW/Portal 课表来源热策略状态、确认切换与局部失败隔离区块
settings.tsx: 系统设置页，并发组合首页弹窗、Early Rising 个人资料入口与 Academic 课表数据源热切换区块
treehole.tsx: Treehole 图文帖子、评论检索、Cookie 私有图片预览及管理删除页
users.tsx: 用户搜索、专业/年级筛选与分页页

架构决策
后台页面只消费 entities/admin 的 TanStack Query 契约；互不依赖的查询在渲染时并发启动，运行状态复用 Dashboard 已有字段，不直接解析 Prometheus 文本。
首页弹窗、Early Rising 展示开关与课表来源热策略收敛到 Settings 并发读取；Early Rising 区块只控制排行榜个人资料入口及编辑面板，保留显式保存与服务端审计快照。弹窗区块只维护单份本地草稿，底部动作使用公众号跳转、纯文字、无底部内容三态，切换无底部内容只隐藏输入而不清空文案；图片预览统一经过公开媒体地址边界，multipart PUT 成功后以后端快照替换独立 Query cache。课表策略区块仅保存待确认的瞬时目标。Discover/Treehole 内容管理仍由各自管理页承担，Treehole 管理图只能走后台 Cookie 媒体入口。
后台壳使用中性紧凑工作台：桌面侧栏、移动折叠导航、实心图表与非玻璃提示层共享同一套 shadcn neutral 令牌。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
