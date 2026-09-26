# 06-regression-contracts

What to build: 迁移旧登录、恢复、mobile、评教与缓存测试到现有SchoolAccess合同，不恢复旧架构；将已确认不变量和修复边界固化。
Repository: server
Blocked by: 05-captcha-reset
Status: in_progress

串行拆分（每段独立 sub agent / commit，同样经过架构复盘和主审）：
- 06a：upstream-retry、campus-integrations-compat、evaluation-parser、cache-modernization，改用当前公开入口及注入端口。
- 06b：mobile-jw、mobile-yxt、mobile-yxt-auth-state，迁移派生会话及二次拒绝语义；超长文件按能力拆分。
- 06c：business-flows 共享支架与全部能力用例，保留登录、恢复、缓存与日历有效场景；最终扫描非 Web 旧接口残留。

验收不执行测试：逐项对照生产调用链与断言的因果关系，静态解析/类型检查仅排查语法和契约漂移。删除旧架构专属断言须有当前不变量映射，不能以删场景代替迁移。

验收：代码逻辑review覆盖触发条件、成功与失败分支、并发及后续任务兼容性；不依赖测试执行。原有dirty状态不被覆盖或提交。

## 06a 实现与固定钩子

第一版将四套用例切换到当前生产边界，不新增生产兼容层：
- upstream 旧回调与 CredentialManager 场景 → SchoolRequestExecutor 的临时重试/一次恢复重放、SchoolRecovery 的单次换票恢复、SchoolStateStore 的快照条件删除。保留 Portal/JW × 登录/轮换、同值 epoch、deadline、成绩临时错误和 3003/评教门禁不重试；补上共享恢复短等待不取消长等待及写请求不重放。
- TicketExchanger 内置三次与旧失败结果 → 协议单次且 typed unavailable；CAS 维护页、5xx、结构化账号密码/验证码拒绝、Portal 网络透传场景保留。
- 旧认证/HTTP/upstream Facade 引用相等 → 已删除入口不复生；仍存在 parsers/Portal services 的引用一致性逐项保留。
- 评教旧静态客户端入口 → EvaluationApplicationService 经真实 SchoolAccess 具名操作读取/提交，只替换 HttpClient 网络和恢复快照。列表/表单解析、主框架发现、bounded batch/续批、重排增量、单次 POST 和 unknown 保留；二次拒绝改为 3005 准备失败，明确交互要求才穿透 3003。提交响应错误但列表增量成立仍确认，默认 dry-run 不 POST。
- Cache 原 upstream 注入 → readJwSchedule，额外 Portal 端口以意外调用直接失败；其余缓存与 singleflight 场景保持。

架构第二轮：不建立模拟执行器或复制评教算法；评教 helper 只有装配/spy 生命周期，生产状态机全部真实执行。删除旧兼容 import、可变 config 重试覆写和无用数据库查询；四文件均小于 800 行。复查发现旧评教标题错误要求响应成功，已改为列表增量事实并补反例；清理换票用例残留缩进。L3/L2 已同步，生产模块与顶层结构不变，L1 无需修改。

机械检查：四文件及其传递依赖以 strict TypeScript noEmit 检查通过；Bun 静态 bundle（external bun:test，输出 /tmp/huas-06a-static-build）通过；git diff --check 通过。首次未加 strict 的独立 tsc 触发 Drizzle 非 strict 推导噪声，已按项目 strict 选项复查，修正真实缺失端口与 unknown 数据断言后通过。没有执行测试或构建产物。

主 agent 代码逻辑 review 已通过：旧快照四路径实际仓储断言、恢复/执行器职责、评教真实协议与列表增量闭环、替身 finally 还原及缓存端口边界均已核对。06a 完成；下一项 06b：mobile-jw/mobile-yxt 派生会话测试迁移，另开 sub agent。
