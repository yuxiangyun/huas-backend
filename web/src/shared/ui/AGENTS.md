# ui/
> L2 | 父级: /Users/xiangyun/workspace/huas-wechat-app/huas-server/web/AGENTS.md

成员清单
action-menu.tsx: 次级与危险动作菜单，基于 Radix Dropdown Menu 收纳低频操作并保留键盘语义
bottom-sheet.tsx: 模态底部弹层容器，统一锁滚动、Esc 关闭、遮罩、安全区与移动/桌面动画
button.tsx: 按钮视觉原语，将语义变体、尺寸、全宽与纯图标行为收敛到统一交互基线
card.tsx: 卡片容器原语，负责响应式圆角、边界、背景与层次阴影
confirm-sheet.tsx: 破坏性或重要动作的二次确认弹层，复用 BottomSheet 并暴露忙碌态
filter-chip.tsx: 可切换筛选标签原语，提供选中语义、尺寸与触控反馈
icon-button.tsx: Button 的无文字图标适配层，强制 aria-label 并复用按钮尺寸协议
image-viewer.tsx: 媒体全屏查看器，提供键盘切换、缩略图导航和响应式图像约束
page-header.tsx: 页级标题原语，统一标题与操作区的垂直中线，允许页面传入组合字标并为窄屏保留换行能力
segmented-control.tsx: 分段选择原语，支持等宽/内容宽排布与可选尾部操作
task-dialog.tsx: 表单与裁切任务容器，基于 Radix Dialog 提供居中弹窗与移动全屏两种展示协议
toast-viewport.tsx: 全局消息视口，消费 toast store 并在壳层安全区内呈现反馈
treehole-avatar.tsx: 社区头像原语，在图片缺失/加载失败时显示中性用户占位或按领域隐藏

架构决策
shared/ui 不调用业务 API 也不持有路由语义；组件只暴露可组合的视觉与交互协议，业务判断由 pages/features/widgets 上层完成。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
