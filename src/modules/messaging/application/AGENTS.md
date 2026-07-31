# application/
> L2 | 父级: /src/modules/messaging/AGENTS.md

成员清单
messaging-application-service.ts: 用户私信编排，先查幂等、再转码/事务提交，并组合会话、增量消息、游标与未读读模型
messaging-operations-query-service.ts: 实现 MessagingOperationsQueryPort 的只读管理用例，组合全量事实、Community 投影与管理媒体读取
orphan-message-media-cleanup-service.ts: 周期任务窄服务，按安全年龄删除未被 message_images 引用的候选目录

架构决策
幂等命中在图片处理之前返回原消息；事务内二次查重解决并发，并在插入前基于 messages 事实限流，未创建的候选文件均回退。
管理查询服务与用户服务共享读模型映射，但不经普通参与者鉴权；它不暴露修改、删除或会话生命周期命令。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
