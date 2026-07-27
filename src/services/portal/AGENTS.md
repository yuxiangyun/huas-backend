# portal/
> L2 | 父级: /Users/xiangyun/workspace/huas-wechat-app/huas-server/src/services/AGENTS.md

成员清单
ecard-service.ts: ECardService 兼容再导出，canonical 一卡通资料适配器位于 campus-integrations/portal
portal-schedule-service.ts: PortalScheduleService 兼容再导出，canonical Portal 单源课表位于 modules/academic
user-service.ts: UserService 兼容再导出，canonical 用户资料适配器位于 campus-integrations/portal

架构决策
本目录只保留 Portal 服务旧导入面；资料能力归 Campus Integrations，课表能力归 Academic，旧路径不得长出双份实现。

开发规范
Portal token 失效、空课表、日期范围和用户资料回写变更必须跑相关 parser 与 business-flow 测试。

变更日志
2026-07-27: PortalScheduleService 迁入 modules/academic，本文件退化为兼容再导出。
2026-07-27: Portal 一卡通与用户资料服务迁入 campus-integrations；当时暂留的 PortalScheduleService 已由后续 Academic 步骤迁出。
2026-07-16: 一卡通缺失余额不再伪造 0 元或写入缓存；课表解析传递完整请求日期范围。
2026-06-30: portal-schedule-service.ts 补齐 _request/source 元信息，供 ScheduleFacade 统一日志语义。
2026-06-30: 明确 portal-schedule-service 按包含端点自然日校验 62 天区间。
2026-06-30: 播种 portal 服务 L2 地图。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
