# application/
> L2 | 父级: /src/modules/community/AGENTS.md

成员清单
community-application-service.ts: Community 唯一用例服务，批量投影作者、更新资料，并对头像候选文件执行 DB 失败补偿与旧文件清理

架构决策
应用层同时实现 CommunityProfileReader，消费者只能观察稳定公共 DTO；资料保存成功是头像切换的提交点，文件清理失败不得回滚已提交资料。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
