# credential-recovery/
> L2 | 父级: /Users/xiangyun/workspace/huas-wechat-app/huas-server/src/modules/campus-integrations/AGENTS.md

成员清单
credential-manager.ts: CAS TGC、Portal JWT、JW Session 的强制正 TTL 存储、自有类型批量失效和有界静默恢复；真实登录未取得 Portal 时删除旧 JWT，另向 mobile 暴露不激活 JW 的 Portal-only 窄恢复入口
school-login-context.ts: 真实 CAS 登录 epoch 的 SQLite 抽象，在基础凭证事务内推进 generation 并按 `derived_session:*` 命名空间清理旧派生会话

架构决策
普通过期凭证可沿 TGC 和加密密码静默恢复；CAS 明确要求验证码时持久写入无 TTL 交互标记、清理三类学校凭证，并在真实登录成功前阻断静默恢复。
网络超时及 502/503/504 不计作密码型静默重认证失败并保持瞬态错误语义，由上层在统一次数/时间预算内决定是否重试。
通用 `storeCredential` 只接受 CAS/Portal/JW 与正整数 TTL，读取拒绝无 TTL 的异常基础凭证，批量失效不越过自有凭证/交互标记边界；真实 CAS 登录的新 epoch 不得继承本次未取得的旧 Portal JWT，本地快捷登录和普通 Portal/JW 轮换均不得改变 epoch。
派生会话无 TTL/generation 语义归各业务 repository；credential-recovery 只提供通用登录上下文，不解析 mobile 数据。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
