# migrations/
> L2 | 父级: /src/db/AGENTS.md

成员清单

0001_baseline.ts: 当前生产 SQLite 结构的不可变 baseline，供空库初始化与严格指纹 adoption 使用
0002_community_nickname.ts: expand-only 增加 Web 社区可空昵称列，保留历史用户、头像与内容数据
0003_social_rearchitecture.ts: destructive contract migration，直接丢弃旧评分/旧通知，守恒核心事实并建立通知列表/会话增量索引与一对一私信结构
0004_treehole_post_media.ts: expand-only 增加 Treehole 帖子可空唯一媒体批次键、读取索引与默认空数组的存储中立图片元数据
0005_community_bio.ts: expand-only 为 Community 资料增加可空单行 Bio
0006_early_rising.ts: expand-only 建立每日唯一的 Early Rising 打卡事实及排名/趋势索引
0007_early_rising_settings.ts: expand-only 建立 id=1 的 Early Rising 展示设置快照，默认显示排行榜个人资料入口
index.ts: 编号 migration 注册表，固定版本顺序并声明多语句执行边界与 destructive 元数据

架构决策

migration 只允许明确意图的前向演进；每个编号一经发布不得改写且不提供自动 down，破坏性版本必须由执行器在任何写入前验证显式授权。
baseline 同时是新库起点和旧库采用标准；既有库必须由执行器证明结构同构后才能写入 adoption 记录。
0003 按产品决策无条件丢弃旧评分表、评分字段和旧 Treehole 通知，不做评分转点赞；同一事务仍断言用户、凭证、缓存与两条 UGC 核心行数守恒。
0004 只保存带唯一索引的 UUID 批次键与不含 URL 的不可变图片元数据；读取 URL 由 Treehole 媒体边界按用户/管理路径投影。
0007 用数据库单行快照持久化展示开关和管理员审计字段，使配置与打卡事实共享既有 SQLite 快照边界。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
