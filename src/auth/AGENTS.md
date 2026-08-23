# auth/
> L2 | 父级: /Users/xiangyun/workspace/huas-wechat-app/huas-server/src/AGENTS.md

成员清单
auth-engine.ts: AuthEngine 兼容再导出，canonical CAS 登录执行器位于 campus-integrations/cas
calendar-signature.ts: Calendar canonical HMAC 签名的兼容再导出，保留旧 signature API
calendar-token.ts: Calendar canonical HMAC 的 token 命名兼容层，保留旧 token/signature 导出
credential-manager.ts: CredentialManager/CredentialSystem 兼容再导出，canonical CAS/Portal/JW 显式数值 TTL 生命周期实现位于 campus-integrations/credential-recovery
jwt.ts: 本服务 JWT 签发与验证工具，隔离客户端身份令牌
ticket-exchanger.ts: TicketExchanger 兼容再导出，canonical TGC 换票实现位于 campus-integrations/cas

架构决策
客户端只持有本服务 JWT；学校上游凭证实现全部归属 Campus Integrations，auth 仅保留旧导入兼容面。
普通凭证过期继续使用加密密码静默恢复；只有 CAS 明确要求验证码才写入无 TTL 的持久化交互标记，直到真实 CAS 登录成功后清除。
calendar-signature.ts 与 calendar-token.ts 只是兼容薄包装，真实签名逻辑只能存在于 modules/calendar/infrastructure。

开发规范
任何凭证刷新、静默重登、验证码流程变更必须跑登录与静默凭证链路测试。
不得在路由或前端暴露 CAS TGC、Portal JWT、JW Session 的原始细节。

变更日志
2026-07-27: 日历 HMAC 迁入 modules/calendar，旧 signature/token 路径保留兼容 Facade。
2026-07-27: CAS 登录、换票与凭证恢复迁入 campus-integrations，旧类名与路径保留再导出 Facade。
2026-07-16: CAS 故障不再伪装密码错误；Portal 换票瞬态网络故障保持上游错误语义。
2026-07-12: 将验证码交互恢复状态从短期内存窗口迁移到 credentials 持久标记。
2026-06-30: 明确已有用户快捷登录与业务请求期凭证恢复的职责边界。
2026-06-30: 播种 auth L2 地图，明确凭证唯一收敛边界。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
