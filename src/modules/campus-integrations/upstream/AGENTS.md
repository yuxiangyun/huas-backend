# upstream/
> L2 | 父级: /Users/xiangyun/workspace/huas-wechat-app/huas-server/src/modules/campus-integrations/AGENTS.md

成员清单
upstream.ts: Portal/JW 请求上下文构造器，按调用方可选总预算编排有限凭证恢复、瞬态请求重试、session expired 失效与一次重建

架构决策
3003、4004 与参数错误不参与瞬态重试；3004/网络错误及调用方明确声明的临时业务错误只在次数和 deadline 双边界内重试。只有真实 session expired 才失效当前子凭证并触发恢复链，无凭证结果统一映射为客户端凭证过期。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
