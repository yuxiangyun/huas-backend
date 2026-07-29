# styles/
> L2 | 父级: /Users/xiangyun/workspace/huas-wechat-app/huas-server/web/AGENTS.md

成员清单
index.css: Tailwind 主题与全局响应式基线，统一设计令牌、壳层间距、安全区、卡片触发器、文本截断和移动表单行为

架构决策
全局样式只承载跨页且与业务无关的浏览器基线；卡片内容布局仍由对应 widget 就近定义，避免全局选择器透传业务偶合。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
