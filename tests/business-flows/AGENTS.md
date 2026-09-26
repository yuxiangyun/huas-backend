# business-flows/
> L2 | 父级: /tests/AGENTS.md

核心业务流测试按能力边界拆分；顶层 `business-flows.test.ts` 在同一 Bun 进程内装配全部用例，以维持进程级模块 mock 与共享 SQLite 的原有隔离语义。

## 成员清单

auth-login.cases.ts: 真实 Identity 路由和 SchoolAuthentication，覆盖本地快捷、CAS 立即 JWT、后台资料不阻塞/失败不撤销、挑战一次消费/过期、认证成功排序、派生清理与密码失败限流
calendar-subscription.cases.ts: 日历订阅用例，覆盖签名、移动教务整学期快照与普通周缓存隔离、24 小时命中不回源、失败不跨源、ICS UID/折行与日期推导
credential-recovery.cases.ts: 真实 SchoolRecovery 的 CAS 用户合流与目标快照，覆盖 Portal/JW 隔离、冻结快照、失败释放、epoch 边界、交互标记及 3004/3005 错误
recovery-cooldown.cases.ts: 统一有界读取重试与不重放 CAS POST、固定五秒/目标隔离/本地快捷不清冷却、短等待不取消共享恢复、真实认证保护迟到提交
harness.ts: 只替换单次 CAS/TGC 与具名业务读取，解析场景保留真实 SchoolAccess + HTTP 替身；真实路由注册、后台资料收尾、数据库和课表策略逐例隔离
persistence-boundaries.cases.ts: 持久化边界用例，覆盖 SQLite 约束/upsert、缓存键限额、Portal 解析失败与一卡通 stale fallback
schedule-cache.cases.ts: 课表缓存用例，覆盖日期校验、周粒度复用、强制刷新、旧键提升、Portal 缺载荷缓存淘汰与 LRU 限额
schedule-fallback.cases.ts: 显式 jw-first 基线下保留双源错误优先级/热切换，区分 legacy 未公布短路与统一课表全来源仲裁
user-cache.cases.ts: 用户与通用缓存用例，覆盖资料回填、Portal 非会话错误 stale fallback、凭证错误穿透与损坏缓存清理

## 架构决策

能力文件使用 `.cases.ts` 后缀，只由聚合入口导入，避免被 `scripts/test.ts` 作为独立套件重复发现。
所有用例共享 `harness.ts` 的学校协议替身与生命周期 hook；认证/恢复走生产类，不创建旧凭证管理器兼容层。`seedCredential` 只调用当前统一基础凭证写入准备数据。
具名读取替身用于验证业务缓存；真实 parser 场景播种合法用户/凭证并把 SchoolAccess 调用交回真实执行器，仅隔离 HttpClient 网络。资料后台任务先排空再还原 spy/resetDb；短等待场景主动 join 同一共享恢复并等待完结，不以 sleep 猜测收尾。
课表策略每例显式 jw-first，退出恢复进入时模式，避免默认 mobile-jw-first 改变旧双源用例的因果关系。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
