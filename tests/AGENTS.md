# tests/
> L2 | 父级: /Users/xiangyun/workspace/huas-wechat-app/huas-server/AGENTS.md

成员清单
academic-refresh-rate-limit.test.ts: 学业接口强制刷新频率限制回归测试
admin-dashboard-activity.test.ts: 管理后台活跃度统计回归测试
auth-login-rate-limit.test.ts: 登录失败限流策略回归测试
business-flows.test.ts: 登录、凭证恢复、缓存降级与核心业务编排总回归套件
classroom-free-parser.test.ts: 空教室解析器回归测试
discover.test.ts: Discover 业务与媒体流程回归测试
e2e.live.test.ts: 真实上游端到端验证入口
e2e.setup.ts: 端到端测试环境初始化
evaluation-parser.test.ts: 教评解析器回归测试
fixtures/: 测试二进制样本目录，包含 HEIC 图片
grade-parser.test.ts: 成绩解析器回归测试
portal-schedule-parser.test.ts: Portal 课表解析器回归测试
public-announcements.test.ts: 公告公共接口回归测试
schedule-parser.test.ts: JW 课表解析器回归测试
setup.ts: 单元与业务流测试数据库、环境变量初始化
treehole.test.ts: 树洞业务与头像媒体回归测试
upstream-retry.test.ts: 上游凭证失效重试、超时与恢复链回归测试

架构决策
测试默认隔离学校真实网络，以 mock 边界验证业务编排；e2e.live.test.ts 是唯一真实上游入口。
凭证正确性测试必须同时覆盖普通静默恢复、验证码持久标记、真实登录清除和 3003 穿透缓存边界。

开发规范
业务代码变更先跑对应定向测试，再跑 `bun test --preload ./tests/setup.ts` 全量回归。
新增、删除或重命名测试文件时同步更新本地图。

变更日志
2026-07-12: 播种 tests L2 地图，补充验证码恢复与缓存穿透测试边界。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
