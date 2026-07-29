# pages/
> L2 | 父级: /Users/xiangyun/workspace/huas-wechat-app/huas-server/web/AGENTS.md

成员清单
admin/: `/m/admin` 后台页面集合，共享独立会话壳并以桌面优先方式呈现管理与运行数据
discover/: Discover 移动端信息流页面，组合发布、详情与评论 widgets
login/: 普通用户校园身份登录页面
me/: 当前用户资料与个人内容入口
me-discover/: 当前用户 Discover 内容管理页面
me-treehole/: 当前用户 Treehole 内容管理页面
treehole/: 树洞移动端信息流页面，组合发布、社区资料与评论 widgets

架构决策
pages 只编排实体查询、feature 动作与 widgets，不直接实现 HTTP 协议或持久状态；普通页面保持路由级懒加载，后台由稳定壳统一装载。
好饭与我的主 Tab 不重复显示路由标题；树洞作为默认入口保留深浅绿宋体字标与叶片识别，右侧动作按发布、编辑资料顺序对齐。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
