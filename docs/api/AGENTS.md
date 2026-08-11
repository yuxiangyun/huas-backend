# docs/api/
> L2 | 父级: docs/AGENTS.md

成员清单
API.md: 后端 API 总索引与校园业务契约，定义认证矩阵、响应包、错误码并导航社交与 Operations 分册。
SOCIAL_API.md: Community、Discover、Treehole、Notifications、Messaging 与 Social 聚合摘要用户侧契约，固定私有图片、稳定增量、三态消息、UUID 幂等、上传和轮询边界。
OPERATIONS_API.md: 公共公告/首页弹窗与后台 Cookie 会话契约，定义 Dashboard/Analytics/日志/策略，以及 Treehole/私信图片的 Cookie 私有读取管理入口。
EVALUATION_API.md: 一键评教接口接入文档，描述发现、状态查询与提交流程。
CLASSROOM_FREE_QUERY_REQUIREMENTS.md: 空教室查询需求备忘，固化上游参数、认证策略与业务取舍。
CLASSROOM_FREE_QUERY_FRONTEND.md: 空教室查询小程序接入文档，给出页面流程、参数与响应结构。
2026-08-09_reverse-huas-jw-contract-report.md: 官方 JW 接口格式逆向与 BFF 兼容修复报告。
2026-08-09_huas-jw-callflow.mmd: 官方 JW 评教发现与混合响应解析链路图源。

架构决策
接口文档按业务边界分册；API.md 只保留总索引与校园接口，社交用户面和 Operations 管理面各有唯一语义源，避免巨型文档重复协议。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
