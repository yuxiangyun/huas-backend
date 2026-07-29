# auth-login/
> L2 | 父级: /Users/xiangyun/workspace/huas-wechat-app/huas-server/web/AGENTS.md

成员清单
model/login-schema.ts: 学号、密码与可选验证码的客户端输入校验契约
ui/login-form.tsx: 普通用户登录交互编排，管理密码记忆、验证码挑战、密码字段级错误恢复、认证提交与登录后导航

架构决策
验证码 session 是一次性挑战：密码拒绝后必须清理已消费挑战；验证码失败则以后端返回的新 session 与图片继续，不复用旧状态。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
