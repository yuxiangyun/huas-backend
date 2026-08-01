# ui/
> L2 | 父级: /Users/xiangyun/workspace/huas-wechat-app/huas-server/web/AGENTS.md

成员清单
action-menu.tsx: 次级与危险动作菜单，基于 Radix Dropdown Menu 收纳低频操作并保留键盘语义
bottom-sheet.tsx: 模态底部弹层与 fullScreen 详情容器，统一锁滚动、Esc、遮罩、安全区、独立内容滚动与可选固定尾部
button.tsx: 按钮视觉原语，将语义变体、尺寸、全宽与纯图标行为收敛到统一交互基线
card.tsx: 卡片容器原语，负责响应式圆角、边界、背景与层次阴影
community-avatar.tsx: Community 公共头像原语，统一媒体地址、按资源隔离图片失败状态与用户占位，切源不复用旧失败帧
confirm-sheet.tsx: 破坏性或重要动作的二次确认弹层，复用 BottomSheet 并暴露忙碌态
empty-state.tsx: 无数据与首次使用状态原语，只呈现事实标题、可选说明和动作
filter-chip.tsx: 可切换筛选标签原语，提供选中语义、尺寸与触控反馈
icon-button.tsx: Button 的无文字图标适配层，强制 aria-label 并复用按钮尺寸协议
image-viewer.tsx: 公开/鉴权媒体全屏查看器，Portal 隔离页面裁剪，通过渲染插槽、可限邻近缩略图窗口、触摸/键盘导航提供响应式查看
lazy-task-fallback.tsx: 路由分块任务占位外壳，在弱网首次打开发布、详情、资料或聊天时立即呈现可感知反馈
page-header.tsx: 页级标题原语，统一标题与操作区的垂直中线，允许页面传入组合字标并为窄屏保留换行能力
private-media-image.tsx: Bearer/Cookie 私有媒体适配原语，按 URL、认证模式与身份代次使用 10 分钟/24MB 会话 LRU，支持调用方滚动根内的近视口请求、显式清空和切源隔离
segmented-control.tsx: 分段选择原语，支持等宽/内容宽排布与可选尾部操作
social-page-title.tsx: Social 主 Tab 的文字/品牌标题原语，统一中文楷体字标或品牌图片字标的显示尺寸与裁切且不引入外部字体请求
social-count-action.tsx: Social 互动计数按钮原语，统一图标触控尺寸、弱化数字格式与可选激活态，不持有业务 mutation
task-dialog.tsx: 表单与裁切任务容器，基于 Radix Dialog 提供边界统一、轻量进退场的居中/移动全屏展示及业务可替换头尾布局协议
toast-viewport.tsx: 全局消息视口，消费 toast store 并用 CSS 生命周期动效在壳层安全区内呈现反馈，不把动画运行时带入首屏
unread-badge.tsx: 导航、分段控件与会话列表共享的固定高度未读徽标，单数字保持正圆且多数字按内容扩展

架构决策
shared/ui 不调用业务 API 也不持有路由语义；组件只暴露可组合的视觉与交互协议，业务判断由 pages/features/widgets 上层完成。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
