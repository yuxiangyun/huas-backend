# infra/
> L2 | 父级: /Users/xiangyun/workspace/huas-wechat-app/huas-server/src/services/AGENTS.md

成员清单
cache-service.ts: SQLite 缓存服务，提供 JSON 缓存读写、过期清理和按前缀 LRU 裁剪
refresh-fallback.ts: refresh 失败缓存兜底工具，选择 stale 缓存并标记响应元信息
upstream.ts: 上游请求包装器，执行凭证刷新、超时重试与错误记录

架构决策
infra 是服务层基础设施，不承载具体业务事实；缓存是性能层，不是权威数据源。

开发规范
缓存 key、TTL、LRU 策略和上游错误选择变更必须跑缓存与 retry 测试。

变更日志
2026-06-30: 播种 infra 服务 L2 地图。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
