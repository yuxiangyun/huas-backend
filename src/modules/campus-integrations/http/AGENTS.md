# http/
> L2 | 父级: /Users/xiangyun/workspace/huas-wechat-app/huas-server/src/modules/campus-integrations/AGENTS.md

成员清单
http-client.ts: CookieJar 驱动的学校 HTTP 客户端，统一超时、Header、重定向、Cookie、session expired 与可注入低基数结果观测
retry.ts: 无业务状态的异步重试原语，保留指数退避、抖动与调用方错误选择权

架构决策
HTTP 层只表达传输事实，不解释 Portal/JW 业务响应；认证流显式关闭通用 session expired 判定，由 CAS 适配器处理重定向。
每次实际 fetch 最终只记录一次 success/failure/timeout；observer 默认 no-op 且异常被隔离，禁止影响重试与错误语义。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
