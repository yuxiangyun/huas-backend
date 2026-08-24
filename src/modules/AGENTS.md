# modules/
> L2 | 父级: /src/AGENTS.md

成员清单
academic/: 学业领域纵向切片，承载课表、成绩、评教与空教室 application/domain/infrastructure
cache/: 本地缓存纵向切片，显式建模永久/限时新鲜度、版本 envelope、SQLite 持久化与进程内 singleflight
calendar/: 日历订阅纵向切片，承载签名、用户查询、Academic 课表编排与 RFC 5545 ICS
campus-integrations/: 学校 CAS、Portal、JW、mobile-yxt 防腐层，收敛 HTTP、凭证恢复、上游编排、只读账单/电费、资料服务与纯解析器唯一实现
community/: 公共社区资料纵向切片，统一默认 displayName、昵称校验、公共/本人 DTO、资料读写与头像媒体
discover/: 好饭内容纵向切片，承载点赞/评论/推荐、Community 作者投影、SQLite 事务与本地媒体
early-rising/: 早起打卡纵向切片，承载北京时间打卡、统计/趋势/排行榜与后台可控的个人资料入口设置
identity/: 身份领域纵向切片，隔离登录应用编排、领域契约、基础设施适配与 HTTP 映射
messaging/: 一对一私信纵向切片，承载会话 lastMessageId 增量、严格 UUID 图文幂等、三态消息/未读、私有媒体与管理只读 port
notifications/: 活动通知纵向切片，承载差异回复事件、事务 Outbox、ID 增量、逐条已读、永久保留与周期投影重试
operations/: 后台管理与运行支撑纵向切片，通过公开只读 query ports 聚合 Dashboard，并承载批量 analytics、公告、日志、会话、社区管理、健康与指标 HTTP 适配
treehole/: 保留树洞产品名称的实名绑定内容切片，承载帖子/点赞/评论、公共/管理模型与 SQLite 事务

架构决策
modules 采用按业务能力组织的纵向切片；切片内部依赖方向固定为 http/infrastructure → application → domain，application 只能通过 ports 访问外部系统与持久化。
Community 通过 Identity 的窄只读端口取得默认名称所需班级事实；所有社交消费者只经 CommunityProfileReader 批量投影公共作者，禁止下探 users/community_profiles。
Discover/Treehole 的有效互动与 activity_outbox 在同一 SQLite 短事务提交；Notifications 按稳定 recipient eventId 幂等投影，unlike 同事务撤销点赞通知。
Messaging 与 Notifications 保持事实隔离：私信未读直接按消息和会话游标计算，不写 activity notification；普通/管理查询分别经参与者鉴权与 MessagingOperationsQueryPort。
旧 auth/core/parsers/routes/services 在迁移期只允许单向委托或再导出新模块，新模块不得反向依赖旧 Facade 或 routes；Discover/Treehole 不再保留旧 routes/services 出口。

变更日志
2026-07-31: 新增 Community 纵向切片，独立拥有公开资料、默认 displayName 与头像媒体，并建立社交作者批量投影端口。
2026-07-31: Discover 删除评分并切换幂等点赞/偏好推荐；Treehole 取消匿名及资料、头像、旧通知职责，统一返回 Community 作者 DTO。
2026-07-31: 新增 Notifications 纵向切片，六类活动由 transactional Outbox 投影并仅支持逐条已读。
2026-07-31: 新增 Messaging 纵向切片，一对一消息以同步 SQLite 短事务提交，私有媒体由参与者与 Operations 管理只读入口隔离。
2026-07-27: 新增 Cache canonical 模块，旧缓存服务退化为 Facade，Academic/Portal 回源接入同键同刷新意图 singleflight。
2026-07-27: 新增 Operations，旧管理 routes/services/runtime/middleware 路径退化为单向兼容 Facade。
2026-07-31: Discover/Treehole 旧 routes/services Facade 完成物理删除，调用方直接使用模块公开入口。
2026-07-27: 新增 Calendar 纵向切片，旧 routes/services/auth 日历实现退化为单向兼容 Facade。
2026-07-27: 新增 academic 纵向切片，旧 Academic/Portal 课表服务退化为兼容 Facade。
2026-07-27: 新增 campus-integrations，建立学校上游协议与凭证恢复的 canonical 防腐层。
2026-08-23: campus-integrations 增加 mobile-yxt 只读切片，以登录 epoch、模块自有会话仓储、Portal 窄 reader、独立限流和有界缓存隔离账单/电费协议。
2026-08-24: 补齐 Early Rising 纵向切片地图，并将排行榜个人资料入口开关建模为模块自有 SQLite 设置事实。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
