# auth/
> L2 | 父级: /Users/xiangyun/workspace/huas-wechat-app/huas-server/src/AGENTS.md

成员清单
auth-engine.ts: CAS 原始登录流程封装，校验 HTTP/维护页后读取 execution、验证码并提交凭证
calendar-signature.ts: 日历订阅 HMAC 签名核心，生成和校验 studentId 绑定签名
calendar-token.ts: calendar-signature 兼容别名，保留旧导入路径，不提供第二套实现
credential-manager.ts: 学校子凭证生命周期收敛层，管理 CAS TGC、Portal JWT、JW Session，并持久化 CAS 验证码交互登录恢复标记
jwt.ts: 本服务 JWT 签发与验证工具，隔离客户端身份令牌
ticket-exchanger.ts: TGC 到 Portal/JW 子凭证交换器，Portal 换票透传超时、DNS、连接重置等瞬态网络错误

架构决策
客户端只持有本服务 JWT；学校上游凭证全部由 CredentialManager 管理，刷新失败统一转为服务端错误语义。
普通凭证过期继续使用加密密码静默恢复；只有 CAS 明确要求验证码才写入无 TTL 的持久化交互标记，直到真实 CAS 登录成功后清除。
calendar-token.ts 只是兼容薄包装，真实签名逻辑只能存在于 calendar-signature.ts。

开发规范
任何凭证刷新、静默重登、验证码流程变更必须跑登录与静默凭证链路测试。
不得在路由或前端暴露 CAS TGC、Portal JWT、JW Session 的原始细节。

变更日志
2026-07-16: CAS 故障不再伪装密码错误；Portal 换票瞬态网络故障保持上游错误语义。
2026-07-12: 将验证码交互恢复状态从短期内存窗口迁移到 credentials 持久标记。
2026-06-30: 明确已有用户快捷登录与业务请求期凭证恢复的职责边界。
2026-06-30: 播种 auth L2 地图，明确凭证唯一收敛边界。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
