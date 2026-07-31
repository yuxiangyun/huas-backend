# widgets/
> L2 | 父级: /Users/xiangyun/workspace/huas-wechat-app/huas-server/web/AGENTS.md

成员清单
comment-thread/: 好饭与树洞共享的无请求评论编辑、父子树组装、作者资料入口、折叠回复与分页交互
chat-sheet/: 一对一私信任务容器，采用定位结果恢复已有会话，以原型精确分组气泡承载图文、稳定 UUID 重试、before 历史与 after 增量
community-profile-dialog/: Community 公共昵称与头像管理任务，统一裁切、更新和头像清除动作
discover-compose-sheet/: 好饭发布弹窗，编排表单验证、首图主图提示、图片预览与创建 mutation
discover-detail-sheet/: Discover 详情弹层，编排幂等点赞、私信作者、评论、图片查看与删除语义
discover-feed/: Discover 单列图片信息流，固定首图为主图、按真实比例约束大图并适度放大小图，组合作者资料、幂等点赞、私信、精简摘要、筛选与分页
message-center/: 私信会话与六类活动通知聚合读容器，分别使用消息/通知 ID 高水位增量刷新
mobile-tab-shell/: Social 四 Tab 应用壳，切换桌面侧边导航与移动安全区底部导航并聚合消息未读
my-posts-panel/: 当前用户 Discover 发布列表，只消费调用方数据和动作
my-treehole-posts-panel/: 当前用户 Treehole 发布列表，只消费调用方数据和动作
public-profile-dialog/: Community 公共用户资料与其 Discover/Treehole 内容聚合入口，连接作者身份、帖子详情和私信
treehole-compose-sheet/: 树洞发布弹窗，编排长度限制、失败反馈与创建 mutation
treehole-detail-sheet/: Treehole 详情弹层，编排点赞、评论、回复与删除语义
treehole-feed/: Treehole 分隔信息流，组合无限列表、作者主页、正文详情、幂等点赞、评论入口、状态反馈与分页

架构决策
widgets 允许组合 entities 查询和 features 动作，但路由级搜索参数与顶层导航仍由 pages 持有；跨好饭/树洞的评论展示只复用无请求组件，客户端根据 parentCommentId 组装评论树，不混合两套 mutation 语义。
发布内容使用 TaskDialog 居中弹窗，聊天与头像裁切在移动端使用全屏任务步骤；只读短详情继续使用 BottomSheet。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
