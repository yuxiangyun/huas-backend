# pages/
> L2 | 父级: /Users/xiangyun/workspace/huas-wechat-app/huas-server/web/AGENTS.md

成员清单
admin/: `/m/admin` 后台页面集合，共享独立会话壳并以桌面优先方式呈现管理、运行数据与私信只读审计
discover/: Discover 移动端信息流页面，以共享 Social 字标、紧凑发布动作与懒任务外壳组合详情和评论 widgets
login/: 普通用户校园身份登录页面
me/: 当前用户资料与个人内容入口，复用普通用户主 Tab 字标与顶部节奏，并为按需资料编辑器提供弱网任务外壳
messages/: 私信与活动通知双读模型页面，只持有目标 userId URL 状态并深链原内容，聊天运行时代码仅在打开会话后加载且下载期间立即呈现外壳
me-discover/: 当前用户 Discover 内容管理页面
me-treehole/: 当前用户 Treehole 图文内容管理与 canonical 分享页面
treehole/: Treehole 移动端连续白色双形态信息流页面，以共享 Social 字标和懒任务外壳组合图文发布、窗口化私有媒体详情、社区资料、分享与评论 widgets
social-route-state.ts: Social 共享 URL 状态纯规则，原子互斥帖子/资料并清除私信 conversationId 重复事实
social-share.ts: Social 帖子系统分享与剪贴板降级规则，统一生成可登录恢复的 canonical 深链

架构决策
pages 只编排实体查询、feature 动作与 widgets，不直接实现 HTTP 协议或持久状态；普通页面与后台页面均保持路由级懒加载。
树洞、好饭、消息与我的使用同一 PageHeader 顶部节奏与 SocialPageTitle 字标；树洞和好饭的移动发布动作共享尺寸、线宽与垂直留白；Treehole 分享统一生成 `postId` canonical 深链，帖子详情与公共资料保持 URL 互斥，私信路由只保存目标 userId。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
