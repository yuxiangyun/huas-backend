# core/
> L2 | 父级: /Users/xiangyun/workspace/huas-wechat-app/huas-server/src/AGENTS.md

成员清单
http-client.ts: HttpClient 兼容再导出，canonical Cookie HTTP 实现位于 campus-integrations/http
retry.ts: retryAsync/RetryOptions 兼容再导出，canonical 重试实现在 campus-integrations/http
url-config.ts: URLS 兼容再导出，canonical 学校端点表位于 campus-integrations/endpoints.ts

架构决策
core 是迁移期只读 Facade，不持有学校通信实现；所有导出单向指向 campus-integrations，禁止形成反向依赖。

开发规范
新增上游基础能力必须保持无业务状态，重试策略不得吞掉错误语义。

变更日志
2026-07-27: 学校 HTTP、retry 与端点实现迁入 campus-integrations，旧路径退化为再导出 Facade。
2026-06-30: 播种 core L2 地图。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
