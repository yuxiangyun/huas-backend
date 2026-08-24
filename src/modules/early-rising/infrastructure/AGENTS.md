# infrastructure/
> L2 | 父级: /src/modules/early-rising/AGENTS.md

成员清单
sqlite-early-rising-repository.ts: SQLite 打卡事实 adapter，以唯一键保证每日幂等并在 SQL 中派生趋势、统计与排行榜
sqlite-early-rising-settings-repository.ts: SQLite 单行展示设置 adapter，以 id=1 upsert 保存后台开关及审计字段

架构决策
打卡事实与展示设置分离为两个仓储；设置以数据库单行快照持久化，自动进入现有 SQLite 备份，不建立额外文件状态。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
