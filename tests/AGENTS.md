# tests/
> L2 | 父级: /Users/xiangyun/workspace/huas-wechat-app/huas-server/AGENTS.md

成员清单
academic-refresh-rate-limit.test.ts: 学业接口强制刷新频率限制回归测试
admin-dashboard-activity.test.ts: 管理后台活跃度、显式渠道优先级与历史 unknown 隔离口径回归测试
admin-session.test.ts: 后台 HttpOnly Cookie 会话建立、保护与撤销回归测试
auth-login-rate-limit.test.ts: 登录失败限流策略回归测试
business-flows.test.ts: 登录凭证、课表/日历双源、成绩/一卡通缓存失败语义、ICS 序列化与核心编排总回归套件
classroom-free-parser.test.ts: 空教室解析器回归测试
discover.test.ts: Discover 业务与媒体流程回归测试
e2e.live.test.ts: 真实上游端到端验证入口
e2e.setup.ts: 端到端测试环境初始化
evaluation-parser.test.ts: 教评解析、actionable/blocked 状态、有界续批、提交响应与抗重排批末回查测试
fixtures/: 测试二进制样本目录，包含 HEIC 图片
grade-parser.test.ts: 成绩表结构、合法空表、错误页拒绝与评教门禁回归测试
portal-schedule-parser.test.ts: Portal 日期范围、课表解析及数字/字符串 code、一卡通余额边界回归测试
public-announcements.test.ts: 公告公共接口回归测试
schedule-parser.test.ts: JW 真实结构、非教学周、登录页与嵌套课程节点去重回归测试
setup.ts: 单元与业务流测试数据库、环境变量初始化
treehole.test.ts: 树洞业务与头像媒体回归测试
upstream-retry.test.ts: 上游重试、CAS HTTP/维护页、Portal 换票瞬态网络错误与凭证恢复链回归测试

架构决策
测试默认隔离学校真实网络，以 mock 边界验证业务编排；e2e.live.test.ts 是唯一真实上游入口。
凭证正确性测试必须同时覆盖普通静默恢复、验证码持久标记、真实登录清除和 3003 穿透缓存边界。

开发规范
业务代码变更先跑对应定向测试，再跑 `bun test --preload ./tests/setup.ts` 全量回归。
新增、删除或重命名测试文件时同步更新本地图。

变更日志
2026-07-16: 成绩/一卡通拒绝错误页和缺失余额，课表限定日期并去重嵌套节点，CAS/Portal 超时与维护页保持真实故障语义。
2026-07-16: 评教测试覆盖 HTTP 200 错误页拒绝、提交后列表确认与本次/累计计数分离。
2026-07-16: 日历订阅补齐中文长文本 UTF-8 75-octet 折行与无损展开回归。
2026-07-16: 后台洞察测试补齐显式渠道优先、旧小程序无头兼容与历史 unknown 不回填边界。
2026-07-12: 新增后台 Cookie 会话安全属性与撤销测试。
2026-07-12: Discover/Treehole 管理接口测试改走后台 Cookie 会话，不再构造 Basic Auth 头。
2026-07-12: 播种 tests L2 地图，补充验证码恢复与缓存穿透测试边界。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
