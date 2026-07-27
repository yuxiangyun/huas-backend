# Runtime 健康、指标与质量门

## 健康端点

| 路径 | 用途 | 成功条件 |
|---|---|---|
| `/health` | 旧兼容健康检查 | 进程 ready、未关闭且 SQLite `SELECT 1` 成功 |
| `/health/live` | 存活探针 | HTTP 进程仍能响应；启动中和优雅关闭中也保持 200 |
| `/health/ready` | 流量就绪探针 | 进程 ready、SQLite 可查询、当前 migration version 等于本 release 最新版本 |

ready 不探测 CAS、Portal 或 JW。学校上游故障不会让实例退出负载均衡；只有本进程、本地 SQLite 或 schema 版本不满足时返回 503。

## 轻量指标

`GET /metrics` 返回 Prometheus 文本，不扫描业务表。当前固定指标：

- `huas_http_requests_total{method,status}`
- `huas_http_request_duration_ms_count{method}`
- `huas_http_request_duration_ms_sum{method}`
- `huas_upstream_requests_total{outcome="success|failure|timeout"}`
- `huas_fallback_total`
- `huas_cache_access_total{result="hit|miss"}`
- `huas_singleflight_merge_total`
- `huas_sqlite_busy_total`
- `huas_analytics_flush_failure_total`
- `huas_process_uptime_seconds`

计数仅存在于当前进程内，重启归零；它们是运行观测，不是业务事实。HTTP method 只保留常用固定集合，其他值统一为 `OTHER`，避免外部输入制造高基数标签。

## 本地与 CI 质量门

```bash
bun run check
```

该命令按固定顺序执行 TypeScript 类型检查、稳定隔离的全量测试入口和内存 SQLite migration 验证。GitHub Actions 仅有一个 job：冻结安装依赖后执行同一条命令；同分支新运行会取消旧运行。

## 正常关闭

入口收到 `SIGINT` 或 `SIGTERM` 后停止接收流量，再执行已注册的有界 shutdown flush hooks。单个 hook 超时或失败不会阻止其他 hook，失败会累计到 `huas_analytics_flush_failure_total` 并写入日志。

Analytics 缓冲实现应通过 `registerShutdownFlushHook('analytics', flush)` 注册，不得自行安装第二套进程信号监听。
