# styles/
> L2 | 父级: /Users/xiangyun/workspace/huas-wechat-app/huas-server/web/AGENTS.md

成员清单
index.css: Tailwind 主题与全局响应式基线，以纯白页面基底统一浅色分割线、带底部边界的 64px 页头、shadcn neutral 令牌、稳定滚动条、柔和骨架、轻量反馈/弹层动效、按真实 Tab 高度推导的底部避让、安全区、卡片触发器、文本截断和移动表单行为

架构决策
全局样式只承载跨页且与业务无关的浏览器基线；卡片内容布局仍由对应 widget 就近定义，避免全局选择器透传业务偶合。
应用壳顶部间距只保留 0.5rem 的非安全区留白，设备安全区由 `env(safe-area-inset-top)` 继续补偿，避免 Social 页头视觉下沉。
共享 PageHeader 以 64px 最小高度形成稳定的上下呼吸空间，并以单条浅色底边界连接内容；所有边框与分割线复用 `line` 令牌，禁止信息流另设高对比硬编码颜色。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
