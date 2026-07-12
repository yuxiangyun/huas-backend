# content/
> L2 | 父级: /Users/xiangyun/workspace/huas-wechat-app/huas-server/src/services/AGENTS.md

成员清单
announcement-service.ts: 公告服务，校验公告输入，以同目录临时文件 + 原子 rename 持久化 data 公告 JSON，并提供公共/管理列表与统计

架构决策
公告当前以文件态保存，属于公共内容支线；不得混入用户、课表、成绩等 SQLite 业务事实。

开发规范
公告结构变更必须同时验证公共路由和管理 dashboard 统计。

变更日志
2026-07-10: 公告写入改为原子替换，拒绝损坏数据，修复空列表复活默认公告，并收紧真实日历日期与运行时输入校验。
2026-06-30: 播种 content 服务 L2 地图。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
