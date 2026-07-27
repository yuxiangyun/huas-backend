# portal/
> L2 | 父级: /Users/xiangyun/workspace/huas-wechat-app/huas-server/src/services/AGENTS.md

成员清单
ecard-service.ts: ECardService 兼容再导出，canonical 一卡通资料适配器位于 campus-integrations/portal
portal-schedule-service.ts: Portal 单源课表服务，读取日期课表、处理缓存、包含端点的日期范围与 _request 元信息
user-service.ts: UserService 兼容再导出，canonical 用户资料适配器位于 campus-integrations/portal

架构决策
Portal 服务表达 Portal 单源数据路径；和 JW 服务的 fallback 方向由 ScheduleFacade 显式决定。

开发规范
Portal token 失效、空课表、日期范围和用户资料回写变更必须跑相关 parser 与 business-flow 测试。

变更日志
2026-07-27: Portal 一卡通与用户资料服务迁入 campus-integrations；PortalScheduleService 留在原位。
2026-07-16: 一卡通缺失余额不再伪造 0 元或写入缓存；课表解析传递完整请求日期范围。
2026-06-30: portal-schedule-service.ts 补齐 _request/source 元信息，供 ScheduleFacade 统一日志语义。
2026-06-30: 明确 portal-schedule-service 按包含端点自然日校验 62 天区间。
2026-06-30: 播种 portal 服务 L2 地图。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
