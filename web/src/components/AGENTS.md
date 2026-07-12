# components/
> L2 | 父级: /Users/xiangyun/workspace/huas-wechat-app/huas-server/web/AGENTS.md

成员清单
dither-kit/: Tripwire dither-kit 源码组件边界，提供 area/bar 图表及其共享绘制原语。

架构决策
components 只收纳外部源码组件；业务通用 UI 继续放在 shared/ui，页面不得直接依赖 dither-kit 内部 canvas/context 文件。

开发规范
升级外部源码后先验证公开入口与 Tailwind 令牌，再运行 Web 类型检查和构建。

变更日志
2026-07-12: 引入 dither-kit area/bar 源码图表。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
