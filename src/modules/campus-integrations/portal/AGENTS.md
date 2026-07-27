# portal/
> L2 | 父级: /Users/xiangyun/workspace/huas-wechat-app/huas-server/src/modules/campus-integrations/AGENTS.md

成员清单
parsers/: Portal code、一卡通、用户资料与日期课表的纯 JSON 解析器
ecard-service.ts: 一卡通资料适配器，保留 cache key、TTL、强制刷新、错误页拒绝与 stale fallback
user-service.ts: 用户资料适配器，保留 cache key、TTL、强制刷新、stale fallback 与姓名班级回写

架构决策
Portal 服务只通过 canonical upstream 取得 token 与客户端，响应结构必须先由纯 parser 收口；缓存与数据库副作用停留在服务适配器，不下沉到 parser。
PortalScheduleService 本阶段仍留在旧 services，通过 parser/upstream Facade 保持行为，等待 Academic 阶段迁移。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
