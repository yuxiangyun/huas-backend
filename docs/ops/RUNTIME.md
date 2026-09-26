# 健康与运行观测

发布、数据备份和失败恢复见 [DEPLOY.md](DEPLOY.md)。

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

## 正常关闭

入口收到 `SIGINT` 或 `SIGTERM` 后先标记关闭（readiness变为503），等待周期任务停止，再停止HTTP服务、并行执行有界flush hooks，最后释放组合根并关闭数据库。重复信号共用同一次关闭流程。

单个flush hook默认最多等待5秒，失败不阻止其他hook并写日志；只有名为analytics的hook失败才累计 `huas_analytics_flush_failure_total`。周期任务停止和HTTP停止不属于这5秒hook预算。

Analytics 缓冲实现应通过 `registerShutdownFlushHook('analytics', flush)` 注册，不得自行安装第二套进程信号监听。
