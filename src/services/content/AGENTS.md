# content/
> L2 | 父级: /Users/xiangyun/workspace/huas-wechat-app/huas-server/src/services/AGENTS.md

成员清单
announcement-service.ts: Operations canonical 公告服务的单向兼容 Facade，保持旧类名与类型路径

架构决策
公告文件事实与校验 canonical 实现位于 Operations；本目录不得恢复文件读写逻辑。

开发规范
公告结构变更必须同时验证公共路由和管理 dashboard 统计。

变更日志
2026-07-27: 公告服务迁入 Operations，本文件退化为单向兼容 Facade。
2026-07-10: 公告写入改为原子替换，拒绝损坏数据，修复空列表复活默认公告，并收紧真实日历日期与运行时输入校验。
2026-06-30: 播种 content 服务 L2 地图。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
