# 移动教务课程表接入与凭证恢复验证

2026-09-05：已将 SuperWL「移动教务 → 学生课程表」作为独立 `mobile-jw` 来源接入本地后端、Admin 与小程序。新模式顺序为移动教务 → JW → Portal，沿用 `GET /api/schedule`。已用授权账号核验当前学期全部 19 周和真实失效恢复；尚未发布。

**范围限制：**当前 `getSycurriculum` 指定学期接口会返回与当前课表矛盾的空表，因此不作为正式来源。第三源只承接当前学期，范围外由既有 JW/Portal 接力；来源能力限制不会成为“课表暂未公布”的证据，也不会覆盖后备来源的真实错误。已有持久化策略或显式环境设置继续优先；升级不会擅自覆盖 Admin 的已有选择。

## 1. 证据与适用范围

授权包括用户提供 APK、本人账号登录、本人课表只读验证和本地代码修改，不包括学校业务写操作。真实测试使用显式迁移的隔离 SQLite，不接触运行数据库。账号、密码、令牌、Cookie 和个人课程原文不进入报告或测试仓库。

- [Scope](/Users/xiangyun/workspace/素材/superwl/work/20260905-mobile-schedule/scope.md)
- [Timeline](/Users/xiangyun/workspace/素材/superwl/work/20260905-mobile-schedule/timeline.md)
- [Work items](/Users/xiangyun/workspace/素材/superwl/work/20260905-mobile-schedule/workitems.md)

| Evidence | 来源与可复核位置 | 观察 |
|---|---|---|
| E-001 | APK WGT 提取的 `app-service.js`，6056、6127–6165 行 | APP 服务入口使用服务 URL 和 tokenAccept；`addTokenForUrl` 将令牌按 tokenKey 加入 URL。25550 行附近 `/api/semester/*` 属于另一套学习中心 |
| E-002 | 线上 `/serverconfig.json` 与 `app.6bed67e66948b9778d5d.1773198141839.js` | 当前 H5 基址、POST query、token 请求头、业务字符串 401 判定 |
| E-003 | [脱敏真实观察](/Users/xiangyun/workspace/素材/superwl/work/20260905-mobile-schedule/evidence/live-observations.json)、[19 周摘要](/Users/xiangyun/workspace/素材/superwl/work/20260905-mobile-schedule/evidence/weeks-summary.json) | 独立 H5 token、HTTP500/code401、全部周课表及完整恢复链 |
| E-004 | `tests/mobile-jw.test.ts`、`tests/schedule-source-policy.test.ts`、`tests/e2e.live.test.ts` | 并发、代次隔离、有限重试、缓存、Admin 写读；真实 API 和坏 H5 恢复再次通过 |

证据文件 SHA-256：

| 文件 | SHA-256 |
|---|---|
| APK `assets/__UNI__AA068AD.wgt` | `08928ea58ee9abb5ad47934f240a7c2159990f80ff5bd4efd6704d38c9a52cbd` |
| 提取 `app-service.js` | `26212529e390b24c970cb290349fd049baf3d70405dc5198a14ed34a82149d00` |
| 保存 `h5-app.js` | `5002259188d52eb588c26a49d374bbf588e89c03ea74bcde449b9cc604e0ab9e` |
| `weeks-summary.json` | `15986931f81bf99652d9fc843908699db8b78c77c6d065a3cae56280098d1374` |
| `live-observations.json` | `8f9c55c2107b11a813586cb9227fda37fcd62b7b48c4a733bfee75f12c500b57` |

APK 证明入口和传参机制，H5 证明当前客户端调用合同，真实响应决定最终认证和解析行为；旧报告仅保留为历史参考。

## 2. 真实地址与登录交换

配置入口：`GET https://jwyd.huas.edu.cn/serverconfig.json`。

- `ApiUrl = https://jwyd.huas.edu.cn/njwhd`
- `schoolCode = 10549`
- SSO：`GET /njwhd/loginSso_hnwlxy?token=<Portal JWT>`，这里的占位符只能在服务端内存中替换。
- 成功：HTTP 302，`Location: /#/casLogin?token=<H5 Token>&userType=2`。
- Portal JWT 无效：HTTP 302，`Location: /#/casLogin?code=2`。
- 另一已观察失败正文为精确文本 `用户获取失败！`；未知 HTML 不推断为凭证失效。

**H5 Token 与 Portal JWT 实测不同。**不能直接把 Portal JWT 放入课表请求头，也不能混用学习中心的 `X-Id-Token`。SSO 只接受同源最多五次请求，拒绝跨域跳转，解析 fragment 而不执行 HTML/JS。

## 3. 上游接口、参数和数据

以下均以 `/njwhd` 为基址，使用 **POST、URL query 参数、空 body、`token: H5 Token` 请求头**。这些是内部客户端能力，小程序不直接访问学校。

| 路径（大小写原样） | Query 参数 | 实测成功数据 |
|---|---|---|
| `/semesterList` | 无 | `data[]`，用户学期 5 项；`isdqxq / semesterId / semesterName` |
| `/findDictionry` | `zzdtype=xnxq` | `data.xnxq[]`，学校学期 55 项；`isdqxq / xnxq01id / xqmc` |
| `/Get_sjkbms` | 无 | `data[]`；`mrms / kbjcmsid / kbjcmsmc`，该接口 code 为数字 `1` |
| `/nodeLIst` | 无 | `data[]`；`nodeId / nodeName`，真实 10 节 |
| `/student/curriculum` | `week=` 或具体周数、`kbjcmsid=` 或模式 ID | 当前学期的周课表；正式接入入口 |
| `/student/getSycurriculum` | `week`、`kbjcmsid`、`xnxqid` | 指定学期周结构；存在实测假空态，仅保留内部探测能力 |

成功信封一般是 `{code:"1", data:...}`；节次模式实测数字 `1`，内部 client 同时接受两种明确成功码。业务错误、未知结构、缺少 data 都不能当作合法空表。

实测默认模式 ID 为 `94CA0081978330A1E05320001AAC856E`，正式当前课表允许 `kbjcmsid=`，代码不硬编码这个值。当前学期 ID 为 `2026-2027-1`。学校字典全量列表不代表用户在所有学期都有课。

周课表 `data` 是长度为 1 的数组：

| 字段 | 结构与处理 |
|---|---|
| `date` | 七个连续日期，从周一开始；每项 `xqmc / mxrq / zc / xqid / rq`，周日 xqid 实测为字符串 `"0"` |
| `item` | **日期 → 课程块 → 课程**三层数组；与 date 逐槽配对 |
| `courses` | 扁平课程列表；与 item 中课程数量交叉校验，不二次拼接 |
| `nodesLst` | `nodeNumber:"01"..."10" / nodeName`，校验课程引用节次 |
| `week / weekday / nodes` | 顶层教学周与展示信息 |
| `topInfo` | `semesterId / week / today / weekday / maxWeek`；当前 maxWeek 为 `"19"` |

课程字段包含 `courseName / teacherName / location / classTime / classWeek / classWeekDetails / startTime / endTIme`，注意上游 `endTIme` 的原始大小写。标准 DTO 只投影：

| 上游值 | 标准 `ICourse` |
|---|---|
| `courseName / teacherName / location` | `name / teacher / location` |
| 日期槽位置 + `date[i].mxrq` | `day`（1–7）和独立 `date` |
| `classWeek` | `weekStr` |
| `classTime="10102"` | 周一、第 01 和 02 节，`section="1-2"` |

`classTime` 第一位是星期，后面每两位是一节。非连续节次拆成多段，不能把中间无课节次补成课程；同时间多课程原样保留。

## 4. 日期校验与真实课表结果

2026-09-05 默认请求返回 **2026-09-07 至 09-13 的第一教学周**，不是请求日期所在自然周。应用层先读取真实锚点，再计算目标周数并复核返回日期；不会把下周数据存到本周缓存。

当前学期第 1 至 19 周均真实请求并通过新解析器，起始周一范围为 2026-09-07 至 2027-01-11。每周课程数：

```json
[8,9,13,13,13,13,13,13,8,11,7,7,7,6,6,6,3,0,0]
```

末两周是结构完整的真实空表，可以返回“本周暂无课程”。相反，同一当前学期第一周 `getSycurriculum` 返回空表，而 `curriculum` 返回 8 项；复核空模式、指定模式、学期字典 ID 和历史春季第 10 周仍无可靠有课结果。正式接入不推断这些空表的业务含义。

## 5. 凭证依赖与无感恢复

| 状态 | 所属模块 | 失效/恢复边界 |
|---|---|---|
| CAS TGC、Portal JWT、JW Session | `credential-recovery` | 保留原正数 TTL；同用户 CAS 恢复共享在途链，按实际取得能力补足 |
| Portal JWT + 登录 epoch 快照 | 共享 `PortalCredentialReader` | 缺失先 TGC 换票，再按已有加密密码静默 CAS；不激活 JW |
| H5 Token + epoch + generation | `mobile-jw` 自有 repository | 无推测 TTL、不持久化 Cookie；epoch 条件写、generation 条件删除 |
| 一卡通派生会话 | `mobile-yxt` 自有 repository | 不与移动课表相互读取或删除，仅共享基础恢复模块 |

移动教务明确失效证据：HTTP 401，或 HTTP 200/500 且 JSON **字符串** `code="401"`。真实坏 H5 返回 HTTP500、`{code:"401", Msg:"非法访问：/semesterList"}`。

恢复顺序：

1. 复用 H5；明确失效时只条件删除请求使用的 generation，同用户合并重建，然后重放白名单只读请求一次。
2. SSO 明确拒绝 Portal 时，只在值仍相同时删除该 Portal JWT，窄恢复一次并重做 SSO；第二次拒绝清理坏值后停止。
3. Portal 缺失先复用 TGC；TGC 过期沿已有加密密码静默 CAS。学校要求验证码时遵循已有交互标记，停止自动尝试，返回统一 3003。
4. 真实 CAS 成功在同一事务推进 epoch 并清理所有旧派生会话；普通 Portal/JW 轮换不推进 epoch。交换前后的 epoch 不一致时丢弃旧结果，有界补做。
5. TGC 换票提交同时核对开始时的 epoch 与 TGC 快照；新登录、显式清理或轮换已经发生时，迟到响应不能覆盖新值或复活被清理凭证。同 epoch 普通 CookieJar 快照竞争先读取已补齐的目标凭证，否则在最新有效 TGC 上最多补一次；竞争仍未收敛时按临时超时结束，不因竞争直接重新 CAS 登录。

普通 500/502/503/504、网络断连、超时走共享 `BUSINESS_RETRY_*`，默认每段最多 **2 次尝试（首次 + 1 次重试）**，退避基数 200ms、上限 800ms，并使用既有抖动配置。Portal 恢复、SSO、课表读取共用 **45 秒总预算**；不是每次重试重新获得 45 秒。基础 CAS 恢复复用同一 Bun/Node cause 链错误分类，临时 500 和网络故障不计入密码失败冷却。403、未知 JSON、未公布、空表不清凭证。

真实验证已覆盖：正常复用、坏 H5 重建、坏 Portal 经 TGC 恢复、Portal/TGC 过期后静默 CAS 再派生 H5；移动教务链未创建 JW 凭证。单元测试另覆盖并发失效、第二次 401、旧 generation 迟到、epoch 变化、换票途中清理、瞬时故障以及无效响应不写缓存。

## 6. 小程序与 Admin 接入

客户端继续请求 `GET /api/schedule?date=YYYY-MM-DD&refresh=true|false`，使用本服务 Bearer JWT。日期取北京时间；`refresh=false` 可命中新鲜/永久缓存，显式刷新才强制回源。成功仍为 `{success:true,data:{week,courses,message},_meta:{...}}`，新增：

```json
{"source":"mobile-jw","primary_source":"mobile-jw","policy_mode":"mobile-jw-first"}
```

这是 `_meta` 字段示例；完整响应还包含既有缓存和回退字段。真实 `date=2026-09-21` 强刷返回第 3 周、13 项、2 次上游请求；普通复读为 0 次上游；坏 H5 后强刷恢复成功、4 次上游。

新模式先穷尽移动教务 → JW → Portal 的 current，再按同序选择允许使用的 stale。原 `jw-first`、`portal-first` 模式继续只编排原双源。3003 不由同来源旧缓存掩盖；仍可由其他可用来源成功响应。

缓存使用独立 `mobile-jw-schedule:<studentId>:<Monday>` 命名空间、v1 envelope 与既有 Academic TTL/LRU；normal/refresh 分开合流，写入按回源开始代次提交。学校凭证不进入缓存键和 DTO。

小程序保留 JW=0、Portal=1，新增 Mobile JW=2 和“移动教务”标签；课表请求预算为 75 秒，其他业务预算不变。前端服从实际 `_meta.source`，无需重建学校登录。

Admin 路径为 `/m/admin/system/settings` 的“课表数据源”，提供“移动教务优先”。原 `GET/PUT /api/admin/academic/schedule-source-policy` 继续使用后台 HttpOnly Cookie，PUT 请求：

```json
{"mode":"mobile-jw-first"}
```

切换只影响随后开始的请求，不清理缓存或主动登录学校。优先级：持久文件 → 显式 `SCHEDULE_SOURCE_MODE` → 默认 `mobile-jw-first`。已有安装需在 Admin 选择新模式；本次未修改运行策略或发布环境。

## 7. 可复现验证

在后端目录执行本地门禁：

```sh
bun run check
bun run web:typecheck
bun run web:build
```

本次后端完整门禁 486 项测试通过，Admin 类型检查与构建通过；小程序 `pnpm check` 的 133 项测试通过。真实移动教务 E2E 单独执行 1 项通过。按用户最新要求不继续进行真实或视觉验证，界面验收由用户负责。

小程序目录执行 `pnpm check`。真实验证须在进程环境预先安全注入 `HUAS_E2E_USERNAME`、`HUAS_E2E_PASSWORD`，不要写入代码或命令历史；只运行本次只读套件：

```sh
bun test --preload ./tests/e2e.setup.ts ./tests/e2e.live.test.ts --test-name-pattern '移动教务'
```

该测试自行在隔离库建立用户，复用 Portal-only 恢复，按当前真实周执行 API、缓存复用、注入本地坏 H5 并验证自动恢复，同时断言 JW 行未变。学校未来要求验证码时会按真实情况失败，测试不会绕过验证码。历史 19 周原文已完成解析验证，交付只保留脱敏数量与日期摘要。

## 8. Finding → Path

| Finding | severity / status / confidence | evidence_ids | location / 结论 |
|---|---|---|---|
| F-001 | n/a_re / validated / high | E-001, E-002, E-003 | APP 服务入口 → `loginSso_hnwlxy` → `casLogin`，交换独立 H5 Token |
| F-002 | n/a_re / validated / high | E-002, E-003, E-004 | `student/curriculum`，三层 item + 七天日期必须成对解析；指定学期空表不能替代当前真实课程 |
| F-003 | n/a_re / validated / high | E-003, E-004 | `session-executor` / `credential-manager`，HTTP500/code401 与普通500需要不同恢复动作，迟到恢复必须条件提交 |

P-001，`path_type=callflow`：

1. APP 移动教务 URL 接收 Portal 令牌，SSO 返回独立 H5 Token（E-001/E-002/E-003，F-001）。
2. 服务端持有 H5 Token，只读请求 curriculum，按真实日期投影课程（E-002/E-003，F-002）。
3. 明确失效沿 H5 → Portal → TGC → CAS 所需最小范围恢复，再只读重放；条件写回保护并发登录（E-003/E-004，F-003）。
4. Academic 三源编排输出稳定课表信封，Admin 控制顺序、小程序识别实际来源（E-004）。

剩余限制：学校服务可继续发生超过预算的不可用；指定学期端点尚无可靠有课证据；本地验证不等于生产发布或线上策略已经切换。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
