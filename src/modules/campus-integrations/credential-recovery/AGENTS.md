# credential-recovery/
> L2 | 父级: /Users/xiangyun/workspace/huas-wechat-app/huas-server/src/modules/campus-integrations/AGENTS.md

成员清单
credential-manager.ts: CAS TGC、Portal JWT、JW Session 的存储、TTL、失效、清理、换票刷新与静默重认证唯一实现

架构决策
普通过期凭证可沿 TGC 和加密密码静默恢复；CAS 明确要求验证码时持久写入无 TTL 交互标记、清理三类学校凭证，并在真实登录成功前阻断静默恢复。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
