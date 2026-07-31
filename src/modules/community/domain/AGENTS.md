# domain/
> L2 | 父级: /src/modules/community/AGENTS.md

成员清单
community.ts: 公共/存储资料 DTO、昵称规范化及基于 Identity className 的默认 displayName 纯规则
ports.ts: CommunityProfileReader、CommunityProfileRepository 与 CommunityAvatarStorage 依赖倒置边界

架构决策
公开资料固定为 id/displayName/avatarUrl 三字段；昵称允许重复，未设置时只取 className 第一个数字前的前缀生成默认名称，缺失前缀回退 `文理er {id}`。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
