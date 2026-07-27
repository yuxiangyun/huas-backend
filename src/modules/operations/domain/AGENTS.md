# domain/
> L2 | 父级: /Users/xiangyun/workspace/huas-wechat-app/huas-server/src/modules/operations/AGENTS.md

成员清单
operations.ts: Dashboard 输入、进程遥测与终端日志等稳定 DTO
ports.ts: 公告、日志、系统状态及跨域管理命令的依赖倒置契约

架构决策
domain 只表达管理聚合语言，不依赖 Hono、Drizzle、Bun 或 Node fs；跨域查询 DTO 由事实所属领域公开，Operations 只消费其契约。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
