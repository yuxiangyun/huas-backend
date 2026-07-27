# infrastructure/
> L2 | 父级: /Users/xiangyun/workspace/huas-wechat-app/huas-server/src/modules/operations/AGENTS.md

成员清单
analytics-service.ts: 当前请求内同步写入 day/platform/metric 事实并生成 overview 时间序列
announcement-service.ts: 校验公告并以同目录临时文件 + 原子 rename 持久化 JSON
community-admin-adapters.ts: 将 Operations 管理命令端口单向适配到 Discover/Treehole canonical application
system-operations.ts: 提供 SQLite SELECT 1、进程内存/uptime 与 serverState 读取
terminal-log-service.ts: 有界反向扫描 pm2 日志，按关键词过滤、时间排序并限制返回条数
ugc-compliance-state.ts: 持久化 normal/compliance 热切换与 Discover/Treehole 分域纯文本 mock

架构决策
本目录只实现 Operations 自有持久化/运行态和向其他领域的外向 adapters；不得让 Identity/Discover/Treehole 反向依赖本模块。
analytics 继续同步写，禁止在此阶段引入批处理、队列或 live/ready/metrics。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
