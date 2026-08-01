# runtime/
> L2 | 父级: /src/AGENTS.md

成员清单
server-state.ts: 进程运行态单例，记录 ready、shutdown 与 deploySlot 供健康检查和优雅停机使用
readiness.ts: 本地就绪判定器，组合进程状态、SQLite SELECT 1 与当前/期望 migration version
runtime-metrics.ts: 进程内低基数计数与 HTTP 延迟聚合器，输出 Prometheus 文本
shutdown-hooks.ts: 正常关闭的有界异步 flush hook 注册与失败隔离协调器
periodic-tasks.ts: 轻量周期任务注册器，统一具名任务启停、错误隔离与单任务防重叠

架构决策
runtime 只承载进程态，不存业务事实；重启可丢失，数据库才是事实源。
ready 只检查本地进程、SQLite 与 migration，启动前另由 DB 入口完成完整 checksum/fingerprint 校验；禁止因学校上游不可用摘除实例。
周期任务必须具名、可停止且同任务不重叠；任务异常互相隔离，不能改变 HTTP 主链或业务事实一致性。Notifications 只注册 Outbox 重试，已读通知永久保留；Discover、Community、Treehole 与 Messaging 无主媒体各自只在组合根注册独立清理任务。

开发规范
新增运行态必须可重建，不得影响用户数据一致性。

变更日志
2026-07-27: 新增 live/ready、本地 migration 就绪检查、轻量指标与正常关闭 flush hooks。
2026-07-31: 删除内容空读运行态 Facade，runtime 只保留可重建的进程生命周期与观测状态。
2026-07-31: 新增 periodic-tasks 注册器，收敛凭证、缓存与验证码会话清理的 timer 生命周期。
2026-07-31: 注册 Activity Outbox 周期重试；取消已读通知历史清理，通知第一版永久保留。
2026-07-31: 注册 Messaging 无主媒体清理，按 grace period 保护事务外仍在处理的候选目录。
2026-08-01: 注册 Discover/Community 独立孤儿媒体清理，以数据库引用与可配置 grace period 保护有效或正在提交的文件。
2026-06-30: 播种 runtime L2 地图。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
