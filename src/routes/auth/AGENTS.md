# auth/
> L2 | 父级: /Users/xiangyun/workspace/huas-wechat-app/huas-server/src/routes/AGENTS.md

成员清单
auth.routes.ts: Identity 登录路由兼容 Facade，继续默认导出旧路径并单向委托 modules/identity/http

架构决策
登录路由旧路径仍是外部认证入口，但不再承载业务；真实 HTTP 映射与应用编排位于 modules/identity，客户端契约保持不变。
首次登录必须建立 CAS TGC，且 Portal JWT 或 JW Session 至少一个可用后才签发 JWT；普通已有用户本地密码命中仍可快捷登录，后续子凭证由 CredentialManager 在业务请求中刷新。
只有持久化 `interactive_login_required` 标记会禁止本地快捷登录；真实 CAS/验证码登录成功并保存学校凭证后清除标记。

开发规范
验证码、静默登录、本地密码回退、首次登录子系统可用性和登录限流改动必须跑 business-flows 登录用例。

变更日志
2026-07-27: 登录实现迁入 modules/identity，旧文件收敛为默认导出兼容 Facade。
2026-07-12: 本地快捷登录改由持久化验证码恢复标记控制，真实 CAS 成功后闭环清除。
2026-06-30: 首次登录改为 Portal/JW 任一可用才放行；登录失败限流接入路由，维度为学号加客户端 IP。
2026-06-30: 播种 auth 路由 L2 地图。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
