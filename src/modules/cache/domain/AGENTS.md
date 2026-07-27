# domain/
> L2 | 父级: /Users/xiangyun/workspace/huas-wechat-app/huas-server/src/modules/cache/AGENTS.md

成员清单
freshness-policy.ts: FreshnessPolicy 值对象与 legacy 秒级 TTL 转换，固定 `ttlMs: 0` 为永久有效
cache-envelope.ts: v1 cache envelope 编解码契约，兼容无版本 payload 并安全拒绝未知版本

架构决策
领域契约不感知 SQLite 行结构；新鲜度负责“何时过期”，envelope 负责“能否理解”，两者互不混合。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
