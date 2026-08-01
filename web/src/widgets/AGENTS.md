# widgets/
> L2 | 父级: /Users/xiangyun/workspace/huas-wechat-app/huas-server/web/AGENTS.md

成员清单
comment-thread/: 好饭与树洞共享的无请求评论编辑、父子树组装、作者资料入口、折叠回复与分页交互
chat-sheet/: 一对一私信任务容器，以 userId 定位结果作为唯一会话事实，用聊天代次隔离异步压图/发送结果，并以 20 条首屏、近视口私有图片、共享上传预处理、稳定 UUID 重试、before 历史与 after 增量承载图文
community-profile-dialog/: Community 公共昵称与头像管理任务，统一裁切、更新和头像清除动作
discover-compose-sheet/: 好饭发布弹窗，编排不随元数据刷新丢失的表单、1MB 目标图预处理、首图提示、预览与创建 mutation
discover-detail-sheet/: Discover 详情弹层，以帖子身份隔离异步互动回写，编排幂等点赞、私信作者、首批 20 条评论、固定输入器、图片查看与删除语义
discover-feed/: Discover 单列图片信息流，固定首图为主图、按媒体元数据预留真实比例且缺省稳定为 4:5、对失效媒体保持同尺寸占位，组合作者资料、同行计数互动、私信、精简摘要、筛选与分页
message-center/: 私信会话与六类活动通知聚合读容器，只轮询当前分区并在聊天打开时暂停，通知用 ID 新增/total 撤销双信号校准
mobile-tab-shell/: Social 四 Tab 白色应用壳，归一化 basename 路径、唯一轮询聚合未读，以有限内容就绪追踪保存/恢复各 Tab 滚动现场，重复点击回顶刷新并按用户意图预热目标页
my-posts-panel/: 当前用户 Discover 发布列表，只消费调用方数据和动作
my-treehole-posts-panel/: 当前用户 Treehole 图文发布列表，以 Bearer 首图缩略图组合调用方数据和打开动作
public-profile-dialog/: Community 公共用户资料与其 Discover/Treehole 图文内容聚合入口，将关闭资料和目标导航的原子状态变换委托给 pages
treehole-compose-sheet/: Treehole 移动全屏图文发布器，编排动态限制、顺序选图、预处理、预览、失败保稿、放弃确认与 multipart mutation
treehole-detail-sheet/: Treehole 图文详情弹层，只挂载当前/相邻私有图片并以帖子身份隔离异步互动回写，以首批 20 条评论和固定输入器编排滑动、全屏、点赞、分享、私信与删除
treehole-feed/: Treehole 双形态信息流，有图帖使用 Instagram 首图层级且正文不重复作者标识、纯文字帖将正文独占排列在作者栏下方，两类帖子统一使用昵称加相对时间作者栏与共享同行计数互动栏

架构决策
widgets 允许组合 entities 查询和 features 动作，但路由级搜索参数与顶层导航仍由 pages 持有；跨好饭/树洞的评论展示只复用无请求组件，客户端根据 parentCommentId 组装评论树，不混合两套 mutation 语义。
好饭长表单使用 TaskDialog 居中弹窗；Treehole 图文发布、聊天与头像裁切在移动端使用全屏任务步骤；只读详情继续使用 BottomSheet。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
