# 06-regression-contracts

What to build: 迁移旧登录、恢复、mobile、评教与缓存测试到现有SchoolAccess合同，不恢复旧架构；将已确认不变量和修复边界固化。
Repository: server
Blocked by: 05-captcha-reset
Status: completed

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

## 06b 实现与固定钩子

第一版将 mobile 测试改用真实 SchoolAccess 具名操作、SchoolRecovery 和 SchoolStateStore；只替换 HTTP 网络或单次交换。旧场景映射：
- mobile-jw 旧 SessionExecutor → `schoolAccess.execute(mobileJw.*)`：500+字符串401、复用、单次重建、二次拒绝、并发 generation、SSO 503 重试、只读 query/头部与 deadline 全保留；二次拒绝改为3005。SSO 不再断言已删除 isAuthFlow，断言空正文和独立 CookieJar。
- CredentialManager Portal-only → 真实 SchoolRecovery：8请求单飞、不触碰JW、迟到 TGC 结果不覆盖新登录、显式清理后不复活、CAS 临时错误固定五秒冷却。断言统一 typed error，不要求原始网络 Error 对象穿透。
- 旧 epoch 手工 reader → 真实认证提交/上下文提交：记录旧/新 Portal 入参，证明旧交换不能写入新 epoch。旧按值失效 → 完整仓储快照条件失效，保留同 epoch 父快照和 generation 迟到失败反例。
- mobile-yxt 旧 SessionExecutor → `schoolAccess.execute(mobileYxt.trades.page)`：Cookie 401/HTML拒绝、Portal窄恢复、JW隔离、一次重建与迟到401全部保留。二次拒绝和无本地密码均3005；credential失败staleAllowed=false，仅可用性/超时为true，新增真实CAS交互标记3003穿透缓存。
- 旧通用TTL写入API已不存在：改为生产统一基础凭证写入的正数到期断言、坏的无TTL基础行读为miss，清理不跨过派生会话；不复活任意TTL参数接口。
- 旧 exchange 传入CAS Jar已由接口禁止：改为真实独立空Jar发出与输出单JSESSIONID。Cookie坏行/命名空间/自动重建/无敏感日志全部保留。
- 旧 normalizeMobileYxtTransportError → 统一错误归一化，加真实具名请求验证Bun/Node故障重试耗尽仍保留stale资格，未知异常保持protocol。
- 业务24月/6条LRU、分页20页、三类有符号totals、缓存合流、独立配额、旧余额HTTP、电费nullable/模板code/位置/协议诊断原场景保留；分页改为真实TradeClient→SchoolAccess网络，不模拟旧post执行器。HTTP测试通过真实registerRoutes装配校园路由，仅将未被测社交依赖注入空Hono，不复制路由拓扑。

架构第二轮：将原955行文件拆为会话测试与业务测试，纯数据fixture只承担准备；共享学校fixture不模拟恢复，也不隐式注册hook，每个套件显式还原spy。CAS提交helper去掉旧credentials包装、无效at和JW写入，JW改由fixture独立播种。所有文件小于800行。主审预反馈要求的真实epoch提交、hook作用域及L3职责均已修正。主审拦下手工挂载子路由削弱限流装配证明的问题，已回到真实registerRoutes并仅注入空社交依赖。无生产代码和Web变化，L1无须更新。

机械检查：strict TypeScript noEmit（含现有heic声明）及Bun静态bundle external bun:test通过；产物仅写/tmp/huas-06b-static-build，从未执行。git diff --check通过。主agent最终代码逻辑review已通过：真实注册器注入、CAS上下文换代时父凭证入参序列、同epoch迟到拒绝、新generation保留、typed错误stale资格及每套显式spy还原均已复查；拆分后职责/地图一致，无恢复算法副本。06b完成；下一项06c迁移business-flows共享支架及能力用例。

## 06c 实现与固定钩子

第一版迁移共享业务流支架及认证/恢复用例，所有旧场景按当前职责保留：
- 删除的 upstream 回调 → 现有 schoolAccess.execute 具名读取。业务缓存场景只替换读取结果；Portal/JW parser 场景播种真实用户与基础凭证、交回真实 SchoolAccess/恢复/解析，仅替换 HttpClient 网络。移动教务客户端替身仍供真实周解析、学期完整性和日历窗口消费；未改其既有 ICS/24 小时/失败不跨源场景。
- 旧 CredentialManager → SchoolRecovery.ensure + requestContext、SchoolStateStore 快照和统一 upsertBaseCredential 播种；没有模拟旧凭证管理器或恢复状态机。Portal/JW 目标共用 CAS 后分开取得冻结快照，过期、失败释放、Portal-only 不改 JW、派生清理、交互标记无 TTL、固定五秒和目标隔离全部保留。
- CAS 失败返回 null/false → typed 3005；明确密码/验证码拒绝 → 3003 且不推进 epoch；网络超时 → 3004，维护/缺 execution/二次会话拒绝 → 3005。TicketExchanger 旧 success=false/upstreamError 返回改成当前单次协议抛错，临时故障次数按统一执行器有界重试断言。
- 显式登录等待 Portal/JW 且全失败无 JWT → 真实 CAS 成功即返回 JWT，再独立读取目标失败，验证 JWT 仍有效。响应不承诺资料已完成，后台任务排空后验证 users；新增阻塞资料回源时已返回 JWT、后台失败不撤销的直接反例。
- 旧 Identity commitRealSchoolLogin → SchoolAuthentication 真实认证排序及仓储原子提交；保留迟到静默成功/拒绝/异常/换票不污染新登录，新增旧显式成功与较新成功/失败排序。验证码保留挑战重试与初始化失败，并增加一次消费与读取时到期。
- 旧短 deadline 取消恢复假设 → 短等待者失败后同一目标长等待者仍完成；deferred 在 finally 放行并 join 收尾，避免后台读取下例全局替身。资料 Promise 同样在 afterEach 排空后才还原 spy，数据库只在下一例重置。
- 课表测试显式 jw-first 并逐例恢复原模式，保留热切换。legacy /api/v1/schedule 仍保留主源未公布短路；统一 /api/schedule 单独验证 Portal 无数据后穷尽 JW 的中文空态，不能把两个入口合同混为一谈。
- 四个相邻遗留契约：JW 未公布注入 readJwSchedule/readPortalSchedule 并保留真实 parser→application→Facade；HttpClient 用默认 manual redirect；Identity dependency 类型从实际 application 导出；Classroom Buildings 传入审计 actor。

架构第二轮：替身只覆盖外部响应，认证/恢复/提交/缓存不复制；沿用真实 registerRoutes 注入未测支线空 Hono。去掉过时的 CredentialManager 类型、无用 imports 和不成立的原始错误对象相等断言；默认资料/课表/成绩按具名能力返回各自 DTO，杜绝后台资料意外消费成绩数据。复盘修正了 HTTP 登录 DTO 不含 user.id 的假设，改为验证真实 JWT 后取得 userId；恢复错误也不再用旧 null 结果掩盖。全部业务流文件小于 800 行，L3/L2 已同步，生产与顶层架构未改，L1 无需更新。

机械检查（未执行测试）：五个入口及传递依赖 strict tsc noEmit 通过，Bun 静态 bundle external bun:test 通过，产物只在 /tmp/huas-06c-static-build；git diff --check 通过。非 Web tests 全目录相对 import/mock.module 路径静态扫描无缺失。删除架构名称只剩兼容测试明确断言它们不存在的字符串；Web 不在范围。未修改生产代码，未访问学校，未推送部署。主 agent 最终代码逻辑 review 已通过：JWT userId 来自真实令牌、阻塞资料 finally/drain、共享失败预注册 rejection、策略/spy 生命周期、legacy/统一仲裁及 Portal-only 缺 TGC 经真实 CAS 保留 JW 全行均已逐链路核对。本轮 8 个串行提交任务（01–05、06a–06c）均已完成实现、架构复盘精简与主审固定钩子；本项提交后，总任务下一步仅仓库范围和交付状态核对，无下一修复任务。
