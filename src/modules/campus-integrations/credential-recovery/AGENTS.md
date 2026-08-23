# credential-recovery/
> L2 | 父级: /Users/xiangyun/workspace/huas-wechat-app/huas-server/src/modules/campus-integrations/AGENTS.md

成员清单
credential-manager.ts: CAS TGC、Portal JWT、JW Session 的强制正 TTL 存储与能力感知静默恢复；同用户只共享一条 CAS 航班，joiner 校验实际能力并优先以新 TGC 串行补足，mobile 的 Portal-only 航班不触碰 JW
school-login-context.ts: Identity/静默恢复共享的真实 CAS SQLite 事务原语，原子推进 epoch、提交实际取得的基础凭证、删除缺失 Portal，并以字面 GLOB 只清理严格 `derived_session:*`

架构决策
普通过期凭证可沿 TGC 和加密密码静默恢复；CAS 明确要求验证码时持久写入无 TTL 交互标记、清理三类学校凭证，并在真实登录成功前阻断静默恢复。
网络超时及 502/503/504 不计作密码型静默重认证失败并保持瞬态错误语义，由上层在统一次数/时间预算内决定是否重试。
通用 `storeCredential` 只接受 CAS/Portal/JW 与正整数 TTL，读取拒绝无 TTL 的异常基础凭证，批量失效不越过自有凭证/交互标记边界；真实 CAS 登录的新 epoch 不得继承本次未取得的旧 Portal JWT，本地快捷登录和普通 Portal/JW 轮换均不得改变 epoch。
派生会话无 TTL/generation 语义归各业务 repository；credential-recovery 只提供通用登录上下文，不解析 mobile 数据。真实 CAS 成功是事务提交边界，不以 Portal/JW 激活成功或本服务 JWT 签发为前提。
恢复 singleflight 保持 user 级 key；共享结果必须携带实际取得的 CAS/Portal/JW 能力，能力不足的 joiner 只能等待当前航班释放后串行补足，禁止按 requirement 拆 key 并发登录 CAS。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
