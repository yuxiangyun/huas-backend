# core/
> L2 | 父级: /Users/xiangyun/workspace/huas-wechat-app/huas-server/src/AGENTS.md

成员清单
http-client.ts: 上游 HTTP 客户端，维护 CookieJar、超时、重定向和认证流请求
retry.ts: 上游请求重试工具，封装可重试错误与延迟策略
url-config.ts: 学校上游 URL 常量，集中 CAS、Portal、JW 入口地址

架构决策
core 只提供底层通信能力，不知道业务路由、数据库和响应结构；上游语义由 auth/services/parsers 解释。

开发规范
新增上游基础能力必须保持无业务状态，重试策略不得吞掉错误语义。

变更日志
2026-06-30: 播种 core L2 地图。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
