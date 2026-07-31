# application/
> L2 | 父级: /src/modules/community/AGENTS.md

成员清单
community-application-service.ts: Community 唯一用例服务，隔离公共/本人资料，以字段 patch 更新昵称或头像，并执行候选补偿与引用确认后的旧文件清理

架构决策
应用层同时实现 CommunityProfileReader，社交消费者只能观察稳定公共 DTO；昵称与头像更新不得读取后整行覆盖，资料 patch 成功是头像切换提交点，旧 URL 只有在仓储确认无引用后才清理，文件清理失败不得回滚已提交资料。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
