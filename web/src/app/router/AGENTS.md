# router/
> L2 | 父级: /Users/xiangyun/.codex/worktrees/4443/huas-server/web/AGENTS.md

成员清单
guards/protected-route.tsx: 普通用户 JWT 路由守卫，将未认证访问安全重定向登录页
paths.ts: Web 与后台 canonical 路径命名源，供路由、导航与重定向共享
redirect.ts: 认证前后站内跳转规范化边界，拒绝站外来源并收敛默认落点
router.tsx: React Router 顶层组合点，装配普通用户与后台独立路由壳

架构决策
路由表只保留当前 canonical 入口；业务能力物理删除后，其历史路径不继续重定向或占位。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
