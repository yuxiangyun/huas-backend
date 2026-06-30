# runtime/
> L2 | 父级: /Users/xiangyun/workspace/huas-wechat-app/huas-server/src/AGENTS.md

成员清单
server-state.ts: 进程运行态单例，记录 ready、shutdown 与 deploySlot 供健康检查和优雅停机使用

架构决策
runtime 只承载进程态，不存业务事实；重启可丢失，数据库才是事实源。

开发规范
新增运行态必须可重建，不得影响用户数据一致性。

变更日志
2026-06-30: 播种 runtime L2 地图。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
