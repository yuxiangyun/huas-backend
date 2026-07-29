# auth/
> L2 | 父级: /Users/xiangyun/workspace/huas-wechat-app/huas-server/web/AGENTS.md

成员清单
api/auth-api.ts: 普通用户登录 HTTP 协议适配器，将服务端 envelope 收敛为成功、验证码挑战或带稳定错误码的异常
model/auth-store.ts: Zustand 认证会话状态，负责 token/用户摘要的 localStorage 持久化、恢复与注销
model/auth-types.ts: 普通用户认证会话与用户摘要的稳定类型契约

架构决策
认证实体只保存本服务 JWT 与展示摘要；校园密码只属于登录 feature 的短暂表单输入，不进入认证 store。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
