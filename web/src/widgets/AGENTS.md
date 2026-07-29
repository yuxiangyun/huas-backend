# widgets/
> L2 | 父级: /Users/xiangyun/workspace/huas-wechat-app/huas-server/web/AGENTS.md

成员清单
comment-thread/: Discover 与 Treehole 共享的无请求评论编辑、回复、列表与分页交互
discover-compose-sheet/: Discover 发布弹层，编排表单验证、图片预览与创建 mutation
discover-detail-sheet/: Discover 详情弹层，编排评分、评论、图片查看与删除语义
discover-feed/: Discover 信息流，组合筛选、无限列表、状态反馈与分页入口
mobile-tab-shell/: 普通用户应用壳，切换桌面侧边导航与移动安全区底部导航
my-posts-panel/: 当前用户 Discover 发布列表，只消费调用方数据和动作
my-treehole-posts-panel/: 当前用户 Treehole 发布列表，只消费调用方数据和动作
treehole-avatar-sheet/: Treehole 头像管理弹层，编排裁切预览、上传与删除动作
treehole-compose-sheet/: Treehole 匿名发布弹层，编排长度限制、提交反馈与创建 mutation
treehole-detail-sheet/: Treehole 详情弹层，编排点赞、评论、回复与删除语义
treehole-feed/: Treehole 信息流，组合无限列表、状态反馈与分页入口

架构决策
widgets 允许组合 entities 查询和 features 动作，但路由级搜索参数与顶层导航仍由 pages 持有；跨 Discover/Treehole 的评论展示只复用无请求组件，不混合两套 mutation 语义。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
