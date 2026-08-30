# cache/
> L2 | 父级: /Users/xiangyun/workspace/huas-wechat-app/huas-server/src/modules/AGENTS.md

成员清单
application/: 缓存回源并发协调，按业务 key 与刷新意图隔离在途请求
domain/: 缓存新鲜度与持久化 envelope 的纯契约，不依赖数据库或业务模块
infrastructure/: SQLite 缓存读写、过期判定、兼容解码、快照令牌条件失效与 LRU 裁剪
cache-service.ts: Cache composition root，装配 SQLite store、进程内 singleflight 与可注入低基数观察器，并保留稳定静态 API 与条件失效出口

架构决策
Cache 模块只显式表达现有本地 SQLite 语义：`ttlMs: 0` 永不自动过期，版本不兼容只产生 miss；快照令牌条件失效只能删除曾读到的同一值，业务模块决定何时刷新与如何 stale fallback。
singleflight 只协调当前进程内相同业务 key、相同刷新意图的回源，不改变返回 DTO、缓存 key 或写入时机。
缓存模块通过 `configureObservers` 暴露观测注册点，默认 no-op 且异常隔离，不反向依赖 Runtime；进程 composition root 负责接入指标。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
