# portal/
> L2 | 父级: /Users/xiangyun/workspace/huas-wechat-app/huas-server/src/services/AGENTS.md

成员清单
ecard-service.ts: Portal 一卡通服务，读取并解析余额信息
portal-schedule-service.ts: Portal 单源课表服务，读取日期课表、处理缓存、包含端点的日期范围与 _request 元信息
user-service.ts: Portal 用户资料服务，读取资料并回写用户姓名班级

架构决策
Portal 服务表达 Portal 单源数据路径；和 JW 服务的 fallback 方向由 ScheduleFacade 显式决定。

开发规范
Portal token 失效、空课表、日期范围和用户资料回写变更必须跑相关 parser 与 business-flow 测试。

变更日志
2026-06-30: portal-schedule-service.ts 补齐 _request/source 元信息，供 ScheduleFacade 统一日志语义。
2026-06-30: 明确 portal-schedule-service 按包含端点自然日校验 62 天区间。
2026-06-30: 播种 portal 服务 L2 地图。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
