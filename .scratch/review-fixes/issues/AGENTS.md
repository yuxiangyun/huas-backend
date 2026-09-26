# issues/
L2 | 父级: /.scratch/review-fixes/AGENTS.md

01-classroom.md: 空教室服务账号认证错误映射为3005/503，保留用户JWT错误及其他故障。
02-schedule-budget.md: 统一课表总截止时间，给有序来源和stale返回留预算；处理singleflight等待者预算隔离。
03-ecard-timeout.md: 校园卡余额和月账单客户端覆盖服务端45秒预算，电费保持20秒服务/30秒客户端合同。
04-session-generation.md: 客户端请求绑定会话代次，旧鉴权失败不能清除同Token新会话，兼顾上传。
05-captcha-reset.md: 3002且未返回新挑战时清除已消费的旧验证码session/image，保留可继续登录入口。
06-regression-contracts.md: 迁移旧登录、恢复、mobile、评教与缓存测试到现有SchoolAccess合同，不恢复旧架构；将已确认不变量和修复边界固化。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
