# migrations/
> L2 | 父级: /src/db/AGENTS.md

成员清单

0001_baseline.ts: 当前生产 SQLite 结构的不可变 baseline，供空库初始化与严格指纹 adoption 使用
0002_community_nickname.ts: expand-only 增加 Web 社区可空昵称列，保留历史用户、头像与内容数据
0003_social_rearchitecture.ts: destructive contract migration，动态守恒核心事实并建立 Community、点赞、Outbox、通知与带 UUID/九图/WebP/发送窗口索引约束的一对一私信结构
index.ts: 编号 migration 注册表，固定版本顺序并声明多语句执行边界与 destructive 元数据

架构决策

migration 只允许明确意图的前向演进；每个编号一经发布不得改写且不提供自动 down，破坏性版本必须由执行器在任何写入前验证显式授权。
baseline 同时是新库起点和旧库采用标准；既有库必须由执行器证明结构同构后才能写入 adoption 记录。
0003 只删除已证明为空的旧评分/旧通知，并在同一事务内动态断言用户、凭证、缓存与两条 UGC 支线的核心行数守恒。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
