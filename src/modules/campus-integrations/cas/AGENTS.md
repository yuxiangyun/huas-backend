# cas/
> L2 | 父级: /Users/xiangyun/workspace/huas-wechat-app/huas-server/src/modules/campus-integrations/AGENTS.md

成员清单
auth-engine.ts: CAS execution、验证码、公钥加密和登录提交执行器，拒绝 HTTP 故障与维护页伪装密码错误
ticket-exchanger.ts: TGC 到 Portal JWT/JW Session 的换票器，保留重试次数、Cookie 变更和瞬态网络故障语义

架构决策
CAS 适配器依赖本模块 HTTP 与端点事实，不知道 Identity 应用层；换票只返回上游结果和登录步骤，凭证落库由 recovery 层决定。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
