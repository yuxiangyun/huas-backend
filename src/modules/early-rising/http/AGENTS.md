# http/
> L2 | 父级: /src/modules/early-rising/AGENTS.md

成员清单
early-rising.routes.ts: Bearer 认证后的打卡、个人统计、趋势、排行榜与客户端展示设置 Hono 路由

架构决策
HTTP 层只解析 userId 与查询参数并包装统一信封；时间裁决、排名及展示设置读取全部下沉应用层。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
