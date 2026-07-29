# business-flows/
> L2 | 父级: /Users/xiangyun/workspace/huas-wechat-app/huas-server/tests/AGENTS.md

核心业务流测试按能力边界拆分；顶层 `business-flows.test.ts` 在同一 Bun 进程内装配全部用例，以维持进程级模块 mock 与共享 SQLite 的原有隔离语义。

## 成员清单

auth-login.cases.ts: 登录能力用例，覆盖本地快捷、CAS、验证码、Portal-only、并发 upsert、限流与错误映射
calendar-subscription.cases.ts: 日历订阅用例，覆盖签名、双源课表缓存、fallback、ICS UID/折行与日期推导
credential-recovery.cases.ts: 凭证恢复用例，覆盖 JW/Portal 静默刷新、验证码阻断、超时穿透与静默重认证
harness.ts: 进程级共享支架，先注册 Campus Integrations、Academic 与 Portal 模块 mock，再延迟装载业务模块并重置逐用例状态
persistence-boundaries.cases.ts: 持久化边界用例，覆盖 SQLite 约束/upsert、缓存键限额与 Portal 解析失败语义
schedule-cache.cases.ts: 课表缓存用例，覆盖日期校验、周粒度复用、强制刷新、旧键提升与 LRU 限额
schedule-fallback.cases.ts: 双源课表用例，覆盖 JW/Portal fallback、错误优先级、空课表与热策略切换
user-cache.cases.ts: 用户与通用缓存用例，覆盖资料回填、强刷失败回退、凭证错误穿透与损坏缓存清理

## 架构决策

能力文件使用 `.cases.ts` 后缀，只由聚合入口导入，避免被 `scripts/test.ts` 作为独立套件重复发现。
所有用例共享 `harness.ts` 的可变上游状态与生命周期 hook；不得把 mock 注册或数据库初始化分散到能力文件。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
