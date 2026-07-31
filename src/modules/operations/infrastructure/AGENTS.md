# infrastructure/
> L2 | 父级: /src/modules/operations/AGENTS.md

成员清单
analytics-batch.ts: 在进程内按 day/platform/metric 聚合计数并去重 active user，以快照交换保证 flush 期间继续采集、失败事实回并后重试
analytics-service.ts: 每 5 秒用一个 SQLite 事务批量写入 analytics 事实，公开失败 observer 与 flush/shutdown，并在 overview 前冲刷以维持即时可读口径
announcement-service.ts: 校验公告并以同目录临时文件 + 原子 rename 持久化 JSON
system-operations.ts: 提供 SQLite SELECT 1、进程内存/uptime 与 serverState 读取
terminal-log-service.ts: 有界反向扫描 pm2 日志，按关键词过滤、时间排序并限制返回条数

架构决策
本目录只实现 Operations 自有持久化与运行态 adapters；跨领域命令由根组合按公开 port 注入，不在此目录持有业务 concrete。
analytics 允许崩溃时丢失至多一个短周期事实；持久化失败不得进入请求错误链，而是记录日志、通知可配置 observer 并保留内存快照供下周期重试。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
