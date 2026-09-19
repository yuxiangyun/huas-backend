# cas/
> L2 | 父级: /Users/xiangyun/workspace/huas-wechat-app/huas-server/src/modules/campus-integrations/AGENTS.md

成员清单
auth-engine.ts: CAS execution、验证码、公钥加密和登录提交执行器，从密码登录错误数组提取失败原因，仅明确拒绝设置 credentialsRejected；验证码与 HTTP/维护故障独立，未知响应/异常加密参数返回 3005/503；CAS 成功票据直接返回，不再等待 Portal 重定向
ticket-exchanger.ts: 单次 TGC 换票，Portal 返回票据 token、JW 保留重定向及主框架验证；明确区分父凭证拒绝、传输故障与未知协议。

架构决策
CAS 适配器不知道 Identity 或业务缓存；只报告学校协议事实，条件写入与唯一重试调度由 SchoolAccess 负责。明确成功票据立即交付身份，不等待 Portal 页面；JW 激活只在请求 JW 时执行。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
