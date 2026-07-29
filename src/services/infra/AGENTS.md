# infra/
> L2 | 父级: /Users/xiangyun/workspace/huas-wechat-app/huas-server/src/services/AGENTS.md

成员清单
cache-service.ts: modules/cache canonical CacheService 的兼容再导出，保留旧导入路径一个版本
refresh-fallback.ts: 非凭证型 refresh 失败缓存兜底工具，选择 stale 缓存、发出可注入观测事件并标记响应元信息，3003 必须穿透
upstream.ts: upstream/UpstreamContext/UpstreamExecutionOptions 兼容再导出，canonical 执行边界位于 campus-integrations/upstream

架构决策
infra 是服务层基础设施，不承载具体业务事实；缓存是性能层，不是权威数据源。
stale fallback 只吸收非凭证型回源失败；`CREDENTIAL_EXPIRED/3003` 必须穿透缓存边界，驱动客户端重新登录。
缓存与 fallback 的 observer 均是异常隔离的旁路，任何指标故障不得改变业务结果。

开发规范
缓存 key、TTL、LRU 策略和上游错误选择变更必须跑缓存与 retry 测试。

变更日志
2026-07-27: 缓存实现迁入 modules/cache，旧服务路径退化为单向再导出 Facade。
2026-07-27: 学校 upstream 编排迁入 campus-integrations，旧服务路径退化为再导出 Facade。
2026-07-12: 禁止 stale 缓存掩盖凭证过期 3003，保留超时等瞬时错误降级。
2026-06-30: 播种 infra 服务 L2 地图。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
