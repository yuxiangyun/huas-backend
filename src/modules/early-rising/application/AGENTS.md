# application/
> L2 | 父级: /src/modules/early-rising/AGENTS.md

成员清单
early-rising-application-service.ts: Early Rising 用例编排器，组合时间窗、打卡事实、Community 排行榜资料与个人资料入口设置快照
ports.ts: 打卡事实和单行展示设置的依赖倒置端口，隔离 SQLite 与可注入 Clock

架构决策
应用层只组合端口返回的事实；时间、排名、连续值与设置更新时间都由注入 Clock 和仓储确定，不依赖 Hono 或 SQLite concrete。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
