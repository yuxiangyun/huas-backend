# application/
> L2 | 父级: /src/modules/messaging/AGENTS.md

成员清单
messaging-application-service.ts: 用户私信编排，定位目标、按 lastMessageId 增量会话、媒体处理完成后确定消息时间，并组合严格 UUID 重试/三态消息/未读读模型
messaging-operations-query-service.ts: 实现管理只读端口，共享会话高水位与最新/before/after 消息语义，并返回媒体 conversationId 审计上下文
orphan-message-media-cleanup-service.ts: 周期任务窄服务，按安全年龄删除未被 message_images 引用的候选目录

架构决策
幂等命中先比较接收人、文字与图片数量；有图重试以临时候选 WebP 字节严格比对后返回原消息，事务内二次查重解决并发，所有未创建候选文件均回退。新发送在图片处理前基于 messages 事实预限流，媒体完成后取提交时间，事务内再次复验以抵抗并发。
管理查询服务与用户服务共享读模型映射，但不经普通参与者鉴权；它不暴露修改、删除或会话生命周期命令。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
