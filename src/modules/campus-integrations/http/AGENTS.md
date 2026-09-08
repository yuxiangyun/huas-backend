# http/
> L2 | 父级: /Users/xiangyun/workspace/huas-wechat-app/huas-server/src/modules/campus-integrations/AGENTS.md

成员清单
http-client.ts: CookieJar 驱动的学校 HTTP 客户端，以单次 timeout/绝对 deadline 约束响应头及完整正文，保留可消费的原 Response 合同；mobile-yxt 由上层传入只含目标域 `/server` Cookie 的独立实例
transport-errors.ts: 共享 Bun/Node cause 链错误事实与瞬态网络分类，供基础恢复隔离失败计数及独立移动业务映射各自错误，不保存原始请求 URL
retry.ts: 无业务状态的有界异步重试原语，保留指数退避、抖动、绝对截止时间与调用方错误选择权

架构决策
HTTP 层只表达传输事实，不解释 Portal/JW 业务响应；认证流显式关闭通用 session expired 判定，由 CAS 适配器处理重定向。
HttpClient 可以承载不同学校域会话但不负责 Cookie 权限收缩；mobile-yxt 认证适配器必须从干净 Jar 开始并在持久化前执行 domain/path/name 白名单。
每次实际 fetch 最终只记录一次 success/failure/timeout；observer 默认 no-op 且异常被隔离，禁止影响重试与错误语义。
校园调用均消费完整页面、JSON 或验证码；HTTP 层在预算内读完正文并返回保留 URL/状态/头部的未消费 Response，正文超时统一为 REQUEST_TIMEOUT 且只观测一次。具体业务决定总预算与可重试错误。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
