# mobile-yxt/
> L2 | 父级: /Users/xiangyun/workspace/huas-wechat-app/huas-server/src/modules/campus-integrations/AGENTS.md

成员清单
auth-exchanger.ts: 从干净 CookieJar 以 Portal JWT 交换临时 tid/accessToken，按真实 fixture 将 host/open 的 401 或 200 HTML 无 tid 识别为凭证拒绝，并通过共享 codec 只输出目标 host、`/server`、JSESSIONID 白名单 Cookie
portal-credential-reader.ts: 原子读取 Portal JWT 与登录 epoch；缺失或被 host/open 明确 401 拒绝时仅条件失效当前 JWT 并恢复 CAS/Portal，绝不读取或激活 JW
session-cookie-codec.ts: mobile CookieJar 权限合同唯一事实源，只接受恰好一个目标 host、`/server`、非空 JSESSIONID，并以无敏感正文协议错误拒绝其他结构
session-repository.ts: `derived_session:mobile_yxt` 自有 SQLite 边界，保存 loginEpoch/accessToken/minimal Cookie；读取在同一事务删除损坏 Jar 为 miss，并提供 epoch 条件创建与 generation 条件失效
session-executor.ts: 消费已验证最小 CookieJar，自有会话读取、同用户单飞创建、交换阶段 Portal 401 单次窄恢复、业务 401 条件失效、一次重建/重试以及第二次 401 清理
mobile-yxt-errors.ts: 认证拒绝及其类型判定、超时、Bun/Node cause 链网络故障、5xx、业务拒绝和协议漂移的无敏感正文语义；协议错误携带不进入公开响应的 operation/stage，并标注 stale 资格
read-rate-limiter.ts: mobile-yxt 独立用户固定窗口配额，由账单/电费应用服务在 refresh 和缓存 miss 时消费
response-parser.ts: 只接受显式 `success=true` 且包含 resultData 的 envelope，以稳定 operation 区分 business/protocol 失败并保持 401-only 会话边界
trade-client.ts: 消费/充值/补助三类月交易的有界分页 HTTP 合同，固定字符串 pageSize 与零基 pageNo
trade-parser.ts: 近 24 个北京时间自然月、合法列表/空态、必需字段、整数分与严格日期解析；原样保留 refundFlag，totals 仅聚合有符号金额
ecard-overview-service.ts: 通过窄 Portal reader 聚合余额/交易，使用固定长度用户月键、每用户 6 条 LRU、独立配额、同键 miss/refresh 合流及子源级 availability/freshness
electricity-client.ts: 串行执行官方 electric config→带七个 location code 的 account 只读链；合同失败只记录 HTTP/结构元数据，禁止正文、凭证、bind、明细、缴费与水费
electricity-parser.ts: config.location 同时产出房间展示与 account query，account.templateList 按 code 投影 nullable 电价/电量、负电量、账户原状态与关闭 capability
electricity-service.ts: 固定长度用户缓存键、独立 miss/refresh 配额、同键回源合流及只允许超时/可用性故障 stale 的电费用例

架构决策
mobile-yxt 会话是由某一真实登录 epoch 的 Portal JWT 派生的无本地 TTL 业务会话；新登录没有取得 Portal JWT 时必须删除旧值，host/open 以 HTTP 401 或真实 200 HTML 无 tid 拒绝本地未过期 JWT 时条件失效并窄恢复一次；登录并发 exchange 依靠 epoch 条件写闭环，业务 401 并发依靠 generation compare-and-delete 闭环。
上游 accessToken 与 mobile-only Cookie 只存在于模块仓储/内存；持久化与读取共享同一 Cookie codec，损坏、空、多 Cookie、错误 host/path 或额外字段一律事务淘汰为 miss 后走正常重建。tid、refreshToken、CAS TGC、Portal Cookie 和无关域 Cookie 不得持久化，任何敏感值均不进入 DTO、缓存键、错误或日志。
交易只允许当前月及此前 23 个自然月，缓存每用户最多保留 6 个热月份；同月 cache miss 与 refresh 共享在途回源，overview 分别投影余额/交易 freshness 与 staleParts；未知结构和协议错误不写缓存、不 stale，认证拒绝固定 3003，超时固定 3004。
refundFlag 原样投影；在真实 fixture 证明退款会计规则前，totals 仅表示上游有符号金额的机械分类求和，不宣称退款已正确冲正。
本模块只开放账单与 electric config/account 读取；account 必须携带 config 返回的 `bigArea/area/building/unit/level/room/subArea`，缺少房间 code 时上游只返回空数值账户壳。bind、usageDetails、pay、水费及任何写接口不属于该边界，官方入口未验证时缴费 capability 固定关闭。
电费 `price`/`quantity` 模板存在但 value 为 null 时表示上游未提供，成功 DTO 原样返回 null；协议漂移不清理派生会话、不写缓存且不允许 stale 掩盖。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
