# domain/
> L2 | 父级: /src/modules/community/AGENTS.md

成员清单
community.ts: 三字段公共/含 nickname 当前/存储资料 DTO、Unicode 昵称校验及基于 Identity className 的默认 displayName 纯规则
ports.ts: CommunityProfileReader、字段级资料 patch/被替换头像结果、头像引用查询与 CommunityAvatarStorage 依赖倒置边界

架构决策
公开资料固定为 id/displayName/avatarUrl 三字段，本人资料额外返回可空 nickname；昵称允许重复但须满足 2–12 Unicode code point、无控制字符/换行且非保留名，空输入只清除存储值。未设置时只取 className 第一个数字前的有效前缀生成默认名称，缺失数字或前缀时回退 `文理er {id}`，默认名永不写回 nickname。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
