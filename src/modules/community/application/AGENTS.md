# application/
> L2 | 父级: /src/modules/community/AGENTS.md

成员清单
community-application-service.ts: Community 唯一用例服务，隔离三字段公共作者与含 nickname 本人资料、更新资料，并对头像候选文件执行 DB 失败补偿与旧文件清理

架构决策
应用层同时实现 CommunityProfileReader，社交消费者只能观察稳定公共 DTO；仅本人资料用例读取 nickname 供编辑回填，资料保存成功是头像切换的提交点，文件清理失败不得回滚已提交资料。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
