# 03：以成绩读取打通统一 SchoolAccess 与只读配置

**What to build:** 成绩读取经具名学校操作恢复 JW 并执行有限重试，业务不再理解凭证链；同时建立后续读取共同使用的请求上下文、错误模型、恢复合流与配置快照。

**Blocked by:** 02：使用已收敛的学校认证与条件提交入口。

**Status:** completed

## Acceptance criteria

- [x] RuntimeConfig 集中解析认证相关整数、单位、零值和默认值，提供只读配置；不接管业务动态配置。
- [x] 具名成绩操作定义只读 POST 和重放资格，保留评教门禁发现结果、45 秒 fresh-first 与缓存/stale 语义。
- [x] JW 直接依赖 CAS，门户失败不再阻止 JW 恢复；同用户静默 CAS 共享一次任务。
- [x] 共享恢复只返回快照，HTTP 客户端与 CookieJar 按请求独立创建；每个等待者独立超时，不能污染共享故障冷却。
- [x] 恢复步骤、传输重试和一次业务恢复重放由一个执行器调度，适配器仅执行单次协议交互；既有次数和总预算有界。
- [x] 成绩应用层不再消费 HttpClient、门户 token、任意学校 URL/HTTP callback 或凭证重试参数。
- [x] 该切片必须真实接通成绩读取，不能仅新增接口或对旧 CredentialManager 包一层壳；生产类型检查通过。

## 验证边界

只允许生产源码类型检查和静态审查。不新增、不读取、不修改、不运行测试，不使用临时复现脚本替代测试，不访问学校上游或生产数据。

## 实施证据

jw.grades 已贯穿 GradeApplicationService；RuntimeConfig 冻结规则，request-executor 是唯一 retryAsync 调用方；JW 目标直接消费 CAS 恢复。 生产类型检查通过；仅有静态证据，未读写或运行测试。最终两轴审查见任务 08。
