# http/
> L2 | 父级: /Users/xiangyun/workspace/huas-wechat-app/huas-server/src/modules/campus-integrations/AGENTS.md

成员清单
http-client.ts: CookieJar 驱动的学校 HTTP 客户端，以单次 timeout 与可选绝对 deadline 的较小值约束 fetch，并统一 Header、重定向、Cookie、session expired 与低基数结果观测
retry.ts: 无业务状态的有界异步重试原语，保留指数退避、抖动、绝对截止时间与调用方错误选择权

架构决策
HTTP 层只表达传输事实，不解释 Portal/JW 业务响应；认证流显式关闭通用 session expired 判定，由 CAS 适配器处理重定向。
每次实际 fetch 最终只记录一次 success/failure/timeout；observer 默认 no-op 且异常被隔离，禁止影响重试与错误语义。
deadline 只阻止预算外的新 fetch/重试；具体业务决定总预算与可重试错误，HTTP 层不识别成绩或课表语义。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
