# infrastructure/
> L2 | 父级: /Users/xiangyun/workspace/huas-wechat-app/huas-server/src/modules/cache/AGENTS.md

成员清单
sqlite-cache-store.ts: Drizzle/SQLite cache 表适配器，执行 envelope 兼容读取、显式新鲜度、清理与前缀 LRU

架构决策
SQLite 行时间戳继续承载命中元信息；payload 版本只保护数据解释，不改变 TTL、touch、source 或 stale 判定。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
