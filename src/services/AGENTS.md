# services/
> L2 | 父级: /Users/xiangyun/workspace/huas-wechat-app/huas-server/src/AGENTS.md

成员清单
academic/: 学校教务服务，聚合课表、成绩、评教与空教室上游访问，依赖 auth 凭证与 parsers 解析器
admin/: 管理台聚合服务，提供仪表盘统计与运行日志读取，不承载业务真相源
calendar/: 日历订阅服务，生成签名链接与 ICS 输出，依赖 auth/calendar-signature
content/: 公共内容服务，管理公告 JSON 与发布统计
discover/: 发现美食服务，独立于学校上游，负责帖子、评论、评分、推荐与媒体
infra/: 基础设施服务，封装缓存、上游调用与刷新兜底
portal/: Portal 侧服务，提供一卡通、用户资料与 Portal 课表
treehole/: 树洞服务，独立社区支线，负责帖子、评论、点赞、通知与头像媒体

架构决策
服务层只编排业务规则与持久化访问；HTTP 参数解析留在 routes，HTML/JSON 解析留在 parsers，运行态副作用收敛到 infra 或具体媒体服务。
跨服务共享必须先问数据归属：学校业务事实进 SQLite 表，媒体进 data/* 文件夹，会话和缓存不得伪装成真相源。

开发规范
新增业务服务必须有 L3 INPUT/OUTPUT/POS 头部；新增子模块必须创建自己的 AGENTS.md 并回链本文件。
超过 800 行的服务文件优先抽出无状态领域规则或查询助手，不改变 public 方法签名与返回语义。

变更日志
2026-06-30: 播种 services L2 地图，明确服务层边界与 Discover 子模块文档入口。
2026-06-30: 父级链接改为 src/AGENTS.md，恢复 L1 -> src -> services 的分形链路。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
