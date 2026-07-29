# widgets/
> L2 | 父级: /Users/xiangyun/workspace/huas-wechat-app/huas-server/web/AGENTS.md

成员清单
comment-thread/: 好饭与树洞共享的无请求评论编辑、父子树组装、折叠回复与分页交互
discover-compose-sheet/: 好饭发布弹窗，编排表单验证、图片预览与创建 mutation
discover-detail-sheet/: Discover 详情弹层，编排评分、评论、图片查看与删除语义
discover-feed/: Discover 信息流，组合筛选、无限列表、状态反馈与分页入口
mobile-tab-shell/: 普通用户应用壳，切换桌面侧边导航与移动安全区底部导航
my-posts-panel/: 当前用户 Discover 发布列表，只消费调用方数据和动作
my-treehole-posts-panel/: 当前用户 Treehole 发布列表，只消费调用方数据和动作
treehole-avatar-sheet/: 社区资料管理弹层，统一昵称编辑、头像裁切上传与删除动作并保留兼容目录名
treehole-compose-sheet/: 树洞发布弹窗，编排长度限制、失败反馈与创建 mutation
treehole-detail-sheet/: Treehole 详情弹层，编排点赞、评论、回复与删除语义
treehole-feed/: Treehole 信息流，组合无限列表、状态反馈与分页入口

架构决策
widgets 允许组合 entities 查询和 features 动作，但路由级搜索参数与顶层导航仍由 pages 持有；跨好饭/树洞的评论展示只复用无请求组件，客户端根据 parentCommentId 组装评论树，不混合两套 mutation 语义。
发布内容使用 TaskDialog 居中弹窗，弹窗内部滚动且保持提交动作可见；头像裁切继续使用移动全屏步骤。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
