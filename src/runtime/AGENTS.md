# runtime/
> L2 | 父级: /Users/xiangyun/workspace/huas-wechat-app/huas-server/src/AGENTS.md

成员清单
server-state.ts: 进程运行态单例，记录 ready、shutdown 与 deploySlot 供健康检查和优雅停机使用
readiness.ts: 本地就绪判定器，组合进程状态、SQLite SELECT 1 与当前/期望 migration version
runtime-metrics.ts: 进程内低基数计数与 HTTP 延迟聚合器，输出 Prometheus 文本
shutdown-hooks.ts: 正常关闭的有界异步 flush hook 注册与失败隔离协调器
ugc-compliance-state.ts: Operations canonical UGC 运行策略的单向兼容 Facade，保持 routes/index.ts 读取路径

架构决策
runtime 只承载进程态，不存业务事实；重启可丢失，数据库才是事实源。
ready 只检查本地进程、SQLite 与 migration，禁止因学校上游不可用摘除实例；指标重启归零且禁止高基数标签。
UGC 合规模式是运行策略，不是业务事实；写入 data/ugc-compliance-state.json 只为热更新、多进程传播与重启后延续。

开发规范
新增运行态必须可重建，不得影响用户数据一致性。

变更日志
2026-07-27: 新增 live/ready、本地 migration 就绪检查、轻量指标与正常关闭 flush hooks。
2026-07-27: UGC 合规运行策略迁入 Operations，本文件退化为单向兼容 Facade。
2026-07-01: 新增 ugc-compliance-state.ts，后台热控制 UGC normal/compliance 模式与分享美食/神秘角落纯文本 mock。
2026-06-30: 播种 runtime L2 地图。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
