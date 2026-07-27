# migrations/
> L2 | 父级: /Users/xiangyun/workspace/huas-wechat-app/huas-server/src/db/AGENTS.md

成员清单

0001_baseline.ts: 当前生产 SQLite 结构的不可变 baseline，供空库初始化与严格指纹 adoption 使用
index.ts: 编号 migration 注册表，固定版本顺序并向执行器暴露迁移元数据

架构决策

migration 只允许 expand-contract 的前向演进；每个编号一经发布不得改写，不提供自动 down，也不得包含破坏性 DDL。
baseline 同时是新库起点和旧库采用标准；既有库必须由执行器证明结构同构后才能写入 adoption 记录。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
