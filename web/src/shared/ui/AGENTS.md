# ui/
> L2 | 父级: /Users/xiangyun/workspace/huas-wechat-app/huas-server/web/AGENTS.md

成员清单
bottom-sheet.tsx: 模态底部弹层容器，统一锁滚动、Esc 关闭、遮罩、安全区与移动/桌面动画
button.tsx: 按钮视觉原语，将语义变体、尺寸、全宽与纯图标行为收敛到统一交互基线
card.tsx: 卡片容器原语，负责响应式圆角、边界、背景与层次阴影
confirm-sheet.tsx: 破坏性或重要动作的二次确认弹层，复用 BottomSheet 并暴露忙碌态
filter-chip.tsx: 可切换筛选标签原语，提供选中语义、尺寸与触控反馈
icon-button.tsx: Button 的无文字图标适配层，强制 aria-label 并复用按钮尺寸协议
image-viewer.tsx: 媒体全屏查看器，提供键盘切换、缩略图导航和响应式图像约束
page-header.tsx: 页级标题原语，在窄屏保护标题可读宽度并将过宽操作区换行
page-hero.tsx: 复杂页首视觉容器，组合标题、描述、操作与装饰内容
page-ornament.tsx: 页面装饰与 IconBubble 原语，将色调、徽章和背景光晕保持在展示层
segmented-control.tsx: 分段选择原语，支持等宽/内容宽排布与可选尾部操作
toast-viewport.tsx: 全局消息视口，消费 toast store 并在壳层安全区内呈现反馈
treehole-avatar.tsx: 树洞头像原语，在图片缺失或加载失败时提供稳定的匿名占位

架构决策
shared/ui 不调用业务 API 也不持有路由语义；组件只暴露可组合的视觉与交互协议，业务判断由 pages/features/widgets 上层完成。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
