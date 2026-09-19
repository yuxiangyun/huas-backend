# adr/
> L2 | 父级: /docs/AGENTS.md

成员清单
0001-service-login-and-school-access.md: 已实现的登录准入与学校交互认证边界，记录学校故障不阻断首次登录、明确交互要求仍触发客户端整体退出的产品取舍。
0002-concurrent-school-login.md: 已实现的真实认证尝试排序规则，较新成功控制账号状态，迟到成功仍可完成本服务登录，较新失败不阻止旧成功。

架构决策
ADR 记录已选择的契约及原因；待实现决策明确标注状态，不替代描述当前行为的 API 与模块地图。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
