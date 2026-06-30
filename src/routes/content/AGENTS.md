# content/
> L2 | 父级: /Users/xiangyun/workspace/huas-wechat-app/huas-server/src/routes/AGENTS.md

成员清单
public.routes.ts: 公共内容 HTTP 适配器，免 Bearer 返回公告列表与公告统计

架构决策
公共内容路由只暴露可匿名读取的数据；管理写入必须走 /api/admin。

开发规范
新增公共接口必须确认无需用户身份，避免把管理数据挂到 /api/public。

变更日志
2026-06-30: 播种 content 路由 L2 地图。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
