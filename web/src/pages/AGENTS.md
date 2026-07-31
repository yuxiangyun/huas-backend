# pages/
> L2 | 父级: /Users/xiangyun/workspace/huas-wechat-app/huas-server/web/AGENTS.md

成员清单
admin/: `/m/admin` 后台页面集合，共享独立会话壳并以桌面优先方式呈现管理、运行数据与私信只读审计
discover/: Discover 移动端信息流页面，组合发布、详情与评论 widgets
login/: 普通用户校园身份登录页面
me/: 当前用户资料与个人内容入口
messages/: 私信与活动通知双读模型页面，持有会话/目标 URL 状态并深链原内容
me-discover/: 当前用户 Discover 内容管理页面
me-treehole/: 当前用户 Treehole 内容管理页面
treehole/: 树洞移动端信息流页面，组合发布、社区资料与评论 widgets

架构决策
pages 只编排实体查询、feature 动作与 widgets，不直接实现 HTTP 协议或持久状态；普通页面与后台页面均保持路由级懒加载。
树洞、好饭、消息与我的使用同一 PageHeader 标题基线；发布、资料编辑、会话与通知细节由对应 widgets 承载。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
