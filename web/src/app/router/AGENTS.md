# router/
> L2 | 父级: /Users/xiangyun/workspace/huas-wechat-app/huas-server/web/AGENTS.md

成员清单
guards/protected-route.tsx: 普通用户 JWT 路由守卫，将未认证访问安全重定向登录页
paths.ts: Social 四 Tab、个人子页与后台 canonical 路径命名源，供路由、导航与重定向共享
redirect.ts: 认证前后站内跳转规范化边界，拒绝站外来源并收敛默认落点
router.tsx: React Router 顶层组合点，匿名根入口选择 Discover，并以 pathless 保护子树隔离 Treehole、消息、我的与个人内容路由

架构决策
路由表只保留当前 canonical 入口；业务能力物理删除后，其历史路径不继续重定向或占位。
Social 壳本身公开以承载一级导航，但只有 Discover 路由属于匿名内容树；其余普通用户路由必须位于同一 ProtectedRoute 子树，不能只依赖页面隐藏交互。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
