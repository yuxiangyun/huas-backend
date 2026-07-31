# messaging/
> L2 | 父级: /src/modules/AGENTS.md

成员清单
application/: 私信用例编排，负责幂等发送、阅读游标、Community 投影与管理只读端口
domain/: 一对一会话、消息/图片事实、公开 DTO、输入校验与依赖倒置 ports
http/: 受 Bearer 认证的私信路由工厂，承载增量轮询、发送、已读和参与者鉴权媒体响应
infrastructure/: Messaging 自有 SQLite 表 adapter 与 message-media 私有文件生命周期 adapter
composition.ts: Messaging 局部组合根，构造 service/routes/operationsQuery/orphanMediaCleanup 且不反向依赖根装配

架构决策
Messaging 只拥有 conversations/messages/message_images 与 message-media；不写入活动通知，不 JOIN users/community_profiles，查询自有事实后经 CommunityProfileReader 批量投影参与者。
会话只在首条消息的同一个同步 SQLite 短事务中按有序 user pair 幂等建立；该事务以 messages 发送事实复验 30 条/分钟，图片在事务外转码，消息和全部元数据同提交。
普通媒体只能由认证后的会话参与者读取；Operations 只能经 MessagingOperationsQueryPort 读取会话、消息和媒体，本模块不导出任何管理修改命令。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
