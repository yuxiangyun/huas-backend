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

入口收到 `SIGINT` 或 `SIGTERM` 后先标记关闭（readiness变为503）并立即停止HTTP新接入，等待启动资源归属确定，再等待周期与HTTP在途、已登记的完整后台业务及学校共享恢复。随后执行有界flush hooks、释放组合根、收尾日志，最后关闭数据库。启动失败与重复信号共用同一次清理流程，各阶段异常不跳过后续收尾。

单个flush hook默认最多等待5秒，失败不阻止其他hook并写日志；只有名为analytics的hook失败才累计 `huas_analytics_flush_failure_total`。周期、HTTP、完整后台业务与共享恢复的实际收尾不属于这5秒hook预算，不能把等待超时当作写入任务已结束。当前analytics写入是同步SQLite短事务；hook限时不会取消其原Promise。

日志flush另有默认5秒预算：停止文件采集后等待Winston队列结束，再等待当前及全部旧轮转文件流完成。transport自动收尾当前文件，入口不重复结束文件流；错误或超时只记录失败，后续输出走控制台。文件流完成表示缓冲写入结束，不构成fsync保证。

Analytics 缓冲实现应通过 `registerShutdownFlushHook('analytics', flush)` 注册，不得自行安装第二套进程信号监听。
