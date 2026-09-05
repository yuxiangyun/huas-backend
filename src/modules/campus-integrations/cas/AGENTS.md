# cas/
> L2 | 父级: /Users/xiangyun/workspace/huas-wechat-app/huas-server/src/modules/campus-integrations/AGENTS.md

成员清单
auth-engine.ts: CAS execution、验证码、公钥加密和登录提交执行器，从密码登录错误数组提取失败原因，区分验证码、凭证拒绝与真实 HTTP/维护故障
ticket-exchanger.ts: TGC 到 Portal JWT/JW Session 的换票器，复用共享 cause 链网络分类并识别直接/重定向 HTTP 5xx，在 HttpClient 剩余预算内有限激活，并以 JW 已登录主框架而非 HTTP 200 验证 Cookie 有效性

架构决策
CAS 适配器依赖本模块 HTTP、端点事实与 JW 会话页协议，不知道 Identity 应用层；换票只返回经页面验证的上游结果和登录步骤，凭证落库由 recovery 层决定。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
