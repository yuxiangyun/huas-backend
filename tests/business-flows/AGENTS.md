# business-flows/
> L2 | 父级: /tests/AGENTS.md

核心业务流测试按能力边界拆分；顶层 `business-flows.test.ts` 在同一 Bun 进程内装配全部用例，以维持进程级模块 mock 与共享 SQLite 的原有隔离语义。

## 成员清单

auth-login.cases.ts: 登录能力用例，覆盖本地快捷、CAS、验证码原因透传、Portal-only、激活全失败仍提交真实登录上下文但不签 JWT、并发 upsert、限流与错误映射
calendar-subscription.cases.ts: 日历订阅用例，覆盖签名、双源课表缓存、fallback、ICS UID/折行与日期推导
credential-recovery.cases.ts: 凭证恢复用例，覆盖能力感知并发 join/串行补足、Portal-only 的 JW 隔离、航班失败释放、CAS 成功失败的 epoch 边界、JW/Portal 刷新与超时穿透
recovery-cooldown.cases.ts: 五秒固定窗口与到期合流、本地登录无上游、维护及 Portal HTTP 故障证据分类、能力隔离和真实登录阻断迟到恢复的事故回归
harness.ts: 进程级共享支架，先注册 Campus Integrations、Academic 与 Portal 模块 mock，再延迟装载业务模块并重置逐用例状态
persistence-boundaries.cases.ts: 持久化边界用例，覆盖 SQLite 约束/upsert、缓存键限额、Portal 解析失败与一卡通 stale fallback
schedule-cache.cases.ts: 课表缓存用例，覆盖日期校验、周粒度复用、强制刷新、旧键提升、Portal 缺载荷缓存淘汰与 LRU 限额
schedule-fallback.cases.ts: 双源课表用例，覆盖 JW/Portal fallback、错误优先级、空课表与热策略切换
user-cache.cases.ts: 用户与通用缓存用例，覆盖资料回填、Portal 非会话错误 stale fallback、凭证错误穿透与损坏缓存清理

## 架构决策

能力文件使用 `.cases.ts` 后缀，只由聚合入口导入，避免被 `scripts/test.ts` 作为独立套件重复发现。
所有用例共享 `harness.ts` 的可变上游状态与生命周期 hook；不得把 mock 注册或数据库初始化分散到能力文件。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
