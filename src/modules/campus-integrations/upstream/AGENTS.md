# upstream/
> L2 | 父级: /Users/xiangyun/workspace/huas-wechat-app/huas-server/src/modules/campus-integrations/AGENTS.md

成员清单
upstream.ts: Portal/JW 请求上下文构造器，编排凭证恢复、瞬态网络重试、session expired 失效与一次重建

架构决策
3003/3004 等 AppError 不参与瞬态重试；只有真实 session expired 才失效当前子凭证并触发恢复链，恢复失败统一映射为客户端凭证过期。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
