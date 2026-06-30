# auth/
> L2 | 父级: /Users/xiangyun/workspace/huas-wechat-app/huas-server/src/routes/AGENTS.md

成员清单
auth.routes.ts: CAS 登录 HTTP 适配器，处理本地快捷登录、登录限流、验证码会话、上游凭证交换、用户 upsert 与 JWT 签发

架构决策
登录路由是外部认证入口；学校子凭证仍交给 CredentialManager/TicketExchanger 收敛，客户端只接收本服务 JWT。
首次登录必须建立 CAS TGC，且 Portal JWT 或 JW Session 至少一个可用后才签发 JWT；已有用户本地密码命中可快捷登录，后续子凭证由 CredentialManager 在业务请求中刷新。

开发规范
验证码、静默登录、本地密码回退、首次登录子系统可用性和登录限流改动必须跑 business-flows 登录用例。

变更日志
2026-06-30: 首次登录改为 Portal/JW 任一可用才放行；登录失败限流接入路由，维度为学号加客户端 IP。
2026-06-30: 播种 auth 路由 L2 地图。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
