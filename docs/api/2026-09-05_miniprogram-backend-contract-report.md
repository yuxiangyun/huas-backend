# 2026-09-05 小程序联动后端契约核对

本次只核对后端业务数据、缓存、刷新和接口契约。保留工作区已有移动教务等改动，不修改小程序，不执行真实评教提交、打卡、资料修改、支付或部署，不运行测试套件。

## 1. 结论与改动

| 对应前端问题 | 后端结论 | 本次处理 |
|---|---|---|
| F1 电费缓存 | TTL=0 是永久快照；缓存时间与回退标记已足够区分普通缓存、本次回源和失败回退 | 不改缓存策略/DTO，纠正 API 文档的时间说明 |
| F2 账单元信息 | 位于 `data.freshness`，没有顶层 `_meta`；交易汇总来自返回的同份交易快照 | 不增加顶层 meta；补空月/不可用/旧值规则，修正文档中空交易数组却非零 totals 的假设示例 |
| F3 退款 | 原始 `isRefund` 类型和值完整投影为 `refundFlag`；本次找到官方 H5 字符串 0/1 的展示依据 | 不增加 `refunded`，不修改金额或汇总；提供保守展示映射 |
| F4/F5 评教 | 原实现将已尝试 POST、回查成功但无完成增量归为 failed；这不能证明学校未执行 | 改为已有状态 unknown，计入 unconfirmedCount；failed 只保留 POST 前准备失败 |
| F6 空成绩值 | credit/gpa 已允许 null，空白或非数值解析为 null | 无业务改动，前端不可 Number(null) |
| F7/F8 月份 | 唯一入口按 Asia/Shanghai 限定当前月及此前 23 月，含首尾 | 无业务改动，明确错误结构和跨年边界 |
| F9 本地课程写入 | 小程序本地持久化问题 | 无后端补偿 |

业务代码仅修改 [evaluation-service.ts](../../src/modules/academic/application/evaluation-service.ts) 的未确认分支；同步领域头部、模块地图、API 文档。阅读共享时间工具时发现缺少 L3，按项目协议为 [time.ts](../../src/utils/time.ts) 补充头部，未改变时间函数。全局地图同步评教语义，不引入新模块。

## 2. 可直接交给前端的字段表

路径均相对于 HTTP JSON 响应体，不是请求库自行拆包后的对象。仅字符串 `refresh=true` 开启强刷。

| 位置 | 字段/类型 | 消费规则 |
|---|---|---|
| 电费 `data` | `remainingKwh: string \| null` | 十进制电量，保留负号；null 为未知，禁止补 0；负值不是学校账户状态的替代品 |
| 电费 `data` | `priceCentsPerKwh: number \| null` | 整数分/度；62 表示 0.62 元/度 |
| 电费 `data` | `cardBalanceCents: number` | 校园卡余额，整数分；不是剩余电量 |
| 电费 `data` | `roomDisplayName/accountStatus: string` | 房间展示与学校账户状态，不自行从电量推断状态 |
| 电费 `data` | `detailsAvailable/officialPaymentAvailable: false` | 不提供明细或缴费入口 |
| 电费 `_meta`；账单 `data.freshness.balance/transactions` | `cached: boolean` | true 为返回缓存快照；false 为该来源本次回源结果 |
| 同上 | `updated_at/cache_time?: string` | 当前 payload 写入 BFF 缓存的北京时间 ISO 时间，二者相同；不是本次响应时间，也不是学校电表/交易系统采样时间 |
| 同上 | `expires_at?: string` | TTL=0 时缺省；缺省不表示现实数据永久不变 |
| 同上 | `stale?/refresh_failed?: boolean` | true 表示过期/失败回退事实；缺省不证明数据年龄很小 |
| 同上 | `last_error?: number` | 回退原因，例如 3004 超时、3005 可用性故障；不是整条 HTTP 响应失败 |
| 同上 | `source?: string` | balance 为 portal，交易和电费为 mobile-yxt |
| 账单 `data` | `balance: object \| null` | 当前读取的 Portal 余额；选择历史月不会取得该月历史余额 |
| 账单 `data` | `unavailableParts/partial` | 子源没有可用结果；partial 等于 unavailableParts 非空 |
| 账单 `data` | `staleParts/degraded` | staleParts 为本次降级旧值来源；degraded 等于 unavailableParts 或 staleParts 非空 |
| 账单 `data` | `transactions/totals` | 同份有效月快照；totals 四项均为有符号整数分的机械分类求和 |
| 账单 `data` | `truncated: boolean` | 任一分类达到分页上限；即使 degraded=false，也不能宣称完整月总额 |
| 交易条目 | `occurredAt: string` | 学校 date 按北京时间解释，输出带 +08:00 的 ISO 字符串；不是缓存更新时间 |
| 交易条目 | `refundFlag: string \| number \| boolean \| null` | 原始 isRefund；保留类型，禁止 Boolean("0") |
| 成绩条目 | `credit/gpa: number \| null` | null 为未知，0 为已知数值零；计算统计时先排除未知值 |

时间字段是可选字段。电费、交易、余额的新鲜回源目前通常只返回 `{cached:false, source:...}`，没有精确读取时间；可显示“本次已刷新”，不能把客户端接收时间冒充学校采样时间。需要准确缓存写入时间时，后续普通读取会返回它；不要求为显示时间额外强刷。前端已有 camelCase `updatedAt` 若存在，仅是自身适配命名，HTTP 正式字段为 `updated_at`。

## 3. 缓存与聚合异常分支（源码确认）

电费普通读取先查缓存并 touch LRU，命中即返回；强刷跳过读缓存。miss 与强刷共享同键在途回源，独立配额在进入回源前消费。成功解析 config/account 后写入 TTL=0 缓存。缓存读取将数据库 `created_at` 投影为 `cache_time/updated_at`，touch 只推进数据库的 LRU `updated_at`，不改变响应数据时间。

只有 mobile-yxt timeout/unavailable 错误可回退旧值，元信息保留原快照时间，并添加 `cached=true, stale=true, refresh_failed=true, last_error`。协议/业务/凭证失败不经电费 stale 回退；配额拒绝发生于 try 之外，也不会伪装刷新成功。回退标志是本次响应事实，不持久化到缓存，下一次普通命中可能又没有 stale；前端应持续展示快照年龄。

账单余额与交易经 Promise.allSettled 独立读取。交易内部对消费、充值、补助执行 Promise.all，任一分类失败不写本次月缓存；允许回退时使用整份旧月快照，不混合不同批次的分类数据。对最终选定的 transactions 排序后直接计算 totals，freshness.transactions 同时来自该结果。每用户最多 6 个热月份，月份被 LRU 淘汰后不能承诺仍有失败回退值。

| 交易结果 | transactions/totals | freshness.transactions | 判别依据 |
|---|---|---|---|
| 合法空月 | [] / 四项 0 | 非 null，可为缓存或新回源 | transactions 不在 unavailableParts；truncated=false 才可称完整空月 |
| 无旧值且可用性故障，余额可用 | [] / 四项 0 | null | transactions 在 unavailableParts，partial/degraded=true；不能显示无交易 |
| 回源失败但旧月可用 | 旧数组 / 按旧数组汇总 | 保留时间并标记 stale/refresh_failed | transactions 在 staleParts，不在 unavailableParts；可提示旧账单 |

交易 fatal 错误（含凭证、协议、业务、参数、限流）会使 overview 整体报错，即使余额可用。两子源都拒绝也整体报错。余额失败而交易成功可部分返回，甚至余额凭证失败也可表现为 balance 不可用；不要把交易侧 fatal 规则推广到所有余额错误。Portal 余额自身的 fallback 范围比 mobile-yxt 宽，沿用共享策略，排除参数/评教阻断/凭证错误。

若 Portal reader fulfilled 但余额不可解析，balance=null 且 unavailableParts 含 balance，freshness.balance 仍可能非 null，表示读取来源的信息；可用性判断优先看 unavailableParts 和 balance，不能只检查 freshness。当前正常解析器已约束余额结构，本次未制造该异常。

源码依据：[电费服务](../../src/modules/campus-integrations/mobile-yxt/electricity-service.ts)、[账单服务](../../src/modules/campus-integrations/mobile-yxt/ecard-overview-service.ts)、[缓存时间投影](../../src/modules/cache/infrastructure/sqlite-cache-store.ts)、[共享回退](../../src/services/infra/refresh-fallback.ts)、[mobile-yxt 错误分类](../../src/modules/campus-integrations/mobile-yxt/mobile-yxt-errors.ts)、[Portal 余额](../../src/modules/campus-integrations/portal/ecard-service.ts)。以上故障路径本次未真实触发。

## 4. 退款：本次新增的官方展示证据

归档 `apk-app-service.js`、`yxt-live-1.js` 中未直接找到 isRefund 判定；后者是分包入口。根据入口中的交易页 chunk 名与 hash，本次只读获取下列公开 JS，均 HTTP 200，无需业务会话：

| 官方资源 | SHA-256 |
|---|---|
| [tradeRecord.716a468c.js](https://mobile-yxt.huas.edu.cn/static/js/pages_plugins-tradeRecord-tradeRecord.716a468c.js) | `2978ce2976cf096d248ea175998c530000eaa13426a87b7e5a97fa601391c8c0` |
| [refundBill.8bbe2965.js](https://mobile-yxt.huas.edu.cn/static/js/pages_plugins-tradeRecord-refundBill.8bbe2965.js) | `ec1582b1aa9b9cf1e8bdb34bf3504fffb2843ec814e28b3953d66aca7a09ac0a` |

交易页 `goBillClick` 在 `t.isRefund && void 0 != t.isRefund` 后用 `"0" == t.isRefund` 进入 billDetail，否则进入 refundBill；模板分别对 `"0" == e.isRefund` 与 `"1" == e.isRefund` 使用普通/退款图标。refundBill 页面显示“退款成功”“退款时间”“退款方式”“退款单号”。这是官方 UI 的处理规则，不能当作真实已退款交易的金额核验。

建议前端仅作展示分类（设计示例，不是新增后端字段）：

```ts
function refundDisplay(flag: string | number | boolean | null) {
  if (flag === '0') return 'ordinary';
  if (flag === '1') return 'refund';
  return 'unknown';
}
```

字符串 0/1 有官方展示证据；549 条归档样本只有字符串 "0"。数字、布尔、null、其他字符串的生产语义与退款会计规则仍未确认。官方使用宽松比较，且数值 0/false 会被点击 truthy 守卫拦截，因此不照搬 JS 隐式转换、不把所有非零值归为退款。后端字段不变，旧前端必须改读 refundFlag，不增加没有必要的布尔别名；totals 不冲正、不剔除退款、不取绝对值。

公开脚本保存在 `/tmp/huas-linked-audit/yxt-tradeRecord-contract.js`、`yxt-refundBill-contract.js`。其余原始业务文件只作本地核对，不随报告提交。

## 5. 评教结果与继续操作规则

批次进入时读取列表，只选一次有界目标（默认 2，最多 3）。表单/列表读取可经 upstream 恢复和有限重试，实际提交使用当次表单的 client.request，一项 POST 只尝试一次，不包在可重试 callback 内。HttpClient.request 自身不重试 POST。

| 字段 | 准确含义 |
|---|---|
| items[].status=submitted | 批末列表观察到同 teacherId/name/college/category 身份的完成增量，且该增量未被本批其他项消费 |
| items[].status=failed | 本项 POST 前表单读取/组参失败；学校未收到本次由该分支发出的 POST，不代表其他调用没有提交 |
| items[].status=unknown | 本项已尝试 POST，但没有可分配的完成增量；包括回查失败和回查成功无增量 |
| unconfirmedCount | unknown 条目数；为 0 时省略，可用 `?? 0` |
| batch.verificationRequests | 逻辑批末回查 0 或 1 次，不计内部读取重试；dryRun 或无 POST 时为 0 |
| batch.verificationSucceeded=false | 批末回查耗尽；status、remainingCount、hasMore 是提交前快照 |
| verificationSucceeded 缺省 | 没有回查失败；可能回查成功，也可能根本未执行回查，须结合 verificationRequests；不代表每项提交已确认 |
| items[] 的任务字段 | 始终来自初始列表，不能用其中 submitted/pending 替代本批 status 枚举 |
| 顶层 status.items | 有成功批末回查时为该快照，否则为初始快照；与本批 items[] 的角色不同 |

实际 POST 抛错（包括超时）后仍进入批末回查；若看到增量可确认为 submitted，未看到则 unknown。回查成功不意味着学校写入已完成或不会继续完成。整个 BFF 响应因客户端断线/取消而丢失时，客户端不知道本批执行到哪一步；先只读查询状态，不能把取消当作撤销、不能自动重放 POST。后端没有跨 HTTP 请求的幂等提交任务 ID，也不能保证并发其他提交产生的同身份增量只来自本调用，故不要并行发起提交批次。

前端优先检查 `verificationSucceeded === false`、`unconfirmedCount > 0` 和 items 中 unknown；任何命中都显示“结果待确认”、停止自动续批，只回查状态。失败条目同样停止续批。全部本批成功后仍检查 hasMore、blockedCount、pendingCount，不能只看 submittedCount/failedCount。现有前端有无进展保护，本报告不声称其会无限重试。

兼容影响：已有枚举和字段不变，但原“已尝试且无增量”分支从 failedCount 转入 unconfirmedCount。只统计 submitted/failed 的旧前端会漏显示，必须同步 F5。批末读取成功但仍 unknown 时不返回 `verificationSucceeded:false`，因为该标志描述读取失败，不描述提交失败。

源码依据：[领域 DTO](../../src/modules/academic/domain/evaluation.ts)、[批次用例](../../src/modules/academic/application/evaluation-service.ts)、[HTTP 单次请求](../../src/modules/campus-integrations/http/http-client.ts)、[路由](../../src/routes/academic/evaluation.routes.ts)。本次未执行任何真实提交或预检来证明这些异常分支。

## 6. 空值与月份窗口

[GradeParser](../../src/modules/campus-integrations/jw/parsers/grade-parser.ts) 对 credit/gpa 使用 parseFloat + Number.isFinite，未知返回 null；[DTO](../../src/types/index.ts) 保留 nullable。加权统计仅使用所需字段均为已知数值的条目，并说明统计覆盖范围；不能把未知 GPA 当 0 纳入分母。真实 57 门样本无 null GPA，null 行为只经代码确认。

[resolveBeijingMonth](../../src/modules/campus-integrations/mobile-yxt/trade-parser.ts) 先用 `Intl.DateTimeFormat` 的 Asia/Shanghai 取得本次请求当前月，输入 trim 后空值取当前月，再匹配四位年与两位月。用 `year * 12 + month` 判定 `[current-23, current]`，UTC 月末计算避免跨年/闰年偏差；查询范围为该月第一天至最后一天，即当前月也传自然月完整边界。

2026-09 可选 2024-10 至 2026-09；2024-09 和 2026-10 均越界。北京时间 2026-10-01 00:00（UTC 2026-09-30 16:00）后窗口平移为 2024-11 至 2026-10。前端日期计算应在进入页面/查询时更新，不在模块加载时永久固定，也不要按设备本地时区改变学校月份。

准确错误结构（按源码构造示例，非本次真实错误采样）：

```json
{
  "success": false,
  "error_code": 4002,
  "error_message": "month 仅允许当前月及此前 23 个自然月"
}
```

HTTP 400；格式错误同为 400/4002，文案 `month 必须严格匹配 YYYY-MM`。任务背景转述的越界文案没有数字两侧空格，当前源码有空格；前端按错误码消费，不匹配整句文案。

## 7. 脱敏真实摘录与假设结构

以下为既有 `bff-4.json` 与 `electricity-fresh.json` 中仅保留电量/电价/元信息的真实摘录，不是完整 DTO，也不是本轮重新读取 BFF：

```json
{
  "data": {"remainingKwh": "-11.10", "priceCentsPerKwh": 62},
  "_meta": {
    "cached": true,
    "cache_time": "2026-08-23T18:45:46.132+08:00",
    "updated_at": "2026-08-23T18:45:46.132+08:00",
    "source": "mobile-yxt"
  }
}
```

```json
{
  "data": {"remainingKwh": "72.80", "priceCentsPerKwh": 62},
  "_meta": {"cached": false, "source": "mobile-yxt"}
}
```

以下仅是假设的电费刷新超时回退元信息片段，没有真实触发该故障：

```json
{
  "_meta": {
    "cached": true,
    "cache_time": "2026-08-23T18:45:46.132+08:00",
    "updated_at": "2026-08-23T18:45:46.132+08:00",
    "source": "mobile-yxt",
    "stale": true,
    "refresh_failed": true,
    "last_error": 3004
  }
}
```

账单的同类字段必须分别放在 `data.freshness.balance` 和 `data.freshness.transactions`，不套用以上电费的顶层位置。完整合法空月假设见 [API 6.8](API.md#68-get-apiecardoverview)，评教完整字段见 [EVALUATION_API.md](EVALUATION_API.md)。

## 8. 验证范围与未确认项

- 本轮亲自读取归档：旧电费快照、强刷结果、账单结构、24 个月比较摘要均 matches=true；遍历原始 trades 文件共 549 个 isRefund，全部为字符串 "0"。这复核的是已有证据，不等于重新独立访问学校。
- 本轮真实网络读取：上列两个官方公开 H5 JS 分包均 HTTP 200。没有登录、业务 refresh 或读取后端数据库凭证，不改变业务缓存及 6 月 LRU。
- 用户交接的既有验证：19 周课表、57 门成绩、24 月 549 条交易、电费强刷、双校区空教室及早起/资料/公告/日历已核对；本轮未重复跑这些全量业务链，也不将交接结论写成本轮实测。
- 本轮仅源码确认：缓存失败回退、子源部分不可用、评教准备/POST/核验的异常分类、成绩 null 和北京时间窗口边界。未注入真实上游故障，未执行评教提交、打卡、资料修改、支付或微信真机操作。
- 静态检查：`bun run typecheck`（tsc --noEmit）通过，`git diff --check` 通过；未运行测试套件。这只验证类型和补丁格式，不证明真实业务异常分支已发生或已验证。
- 仍未知：真实退款样本的正负金额/分类/冲正会计规则，非字符串 0/1 标记的生产语义，真实 null GPA 样本，学校提交在超时后的完成时延。不能用类型检查或文档示例填补这些事实空缺。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
