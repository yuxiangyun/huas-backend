# content/
> L2 | 父级: /Users/xiangyun/workspace/huas-wechat-app/huas-server/src/services/AGENTS.md

成员清单
announcement-service.ts: 公告服务，读写 data 公告 JSON 并提供公共/管理列表与统计

架构决策
公告当前以文件态保存，属于公共内容支线；不得混入用户、课表、成绩等 SQLite 业务事实。

开发规范
公告结构变更必须同时验证公共路由和管理 dashboard 统计。

变更日志
2026-06-30: 播种 content 服务 L2 地图。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
