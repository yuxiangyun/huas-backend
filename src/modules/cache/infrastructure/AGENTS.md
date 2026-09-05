# infrastructure/
> L2 | 父级: /Users/xiangyun/workspace/huas-wechat-app/huas-server/src/modules/cache/AGENTS.md

成员清单
sqlite-cache-store.ts: Drizzle/SQLite cache 表适配器，以 created_at 表达当前 payload 写入时间、updated_at 表达 LRU 访问时间，并执行 envelope 兼容读取、快照令牌条件失效、保时无覆盖提升、显式新鲜度与清理

架构决策
SQLite `created_at` 在每次 payload 写入时更新并投影为响应数据时间；`updated_at` 可被 touch 推进且只参与 LRU，禁止把访问伪装成数据刷新。条件失效以读取时的原始序列化值作令牌，必须在单条 DELETE 中同时比对 key 与令牌，禁止读后裸删覆盖并发新值。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
