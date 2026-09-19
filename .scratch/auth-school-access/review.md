# 后端认证重构静态验收

日期：2026-09-19。固定基线：`70b858ff8e25b2a0461afce931a42ec4e72038b2`。规格：[spec.md](spec.md)。审查包含本轮暂存的生产源码与文档；用户原有技能与 `.gitignore` 修改排除。

本轮只执行生产源码类型检查、差异空白检查及静态审查。未读取、修改、新建或运行测试；未使用复现脚本，未调用学校上游、操作生产数据或修改客户端。

## Standards

第一轮发现两项：一个 P2 规范不一致（mobile 重复传输归一化和协议失败外部码分叉），一个 P3 可维护性判断（基础凭证 upsert 重复）。两个 mobile exchanger 已移除传输错误包装，code/cause 链只由 SchoolAccess 统一解释；协议故障统一为 3005/503，同时保留 operation/stage/staleAllowed。认证与换票共用一个基础凭证写入原语。审查者定向复核：剩余发现 0。

## Spec

第一轮发现一个 P2：20 秒预算在交易分页或电费 config→account 之间耗尽时，统一入口超时未被 mobile-yxt 识别为可 stale。现以统一 UPSTREAM_TIMEOUT 错误码识别该资格，不扩大交互错误、协议故障或普通 503 的降级范围。审查者定向复核：剩余发现 0。

## 静态证据

| 契约 | 实现位置及核对结果 |
| --- | --- |
| CAS 成功立即登录 | CAS 成功票据直接返回；Identity 只消费认证身份并签 JWT，无激活、资料回填或预热调用 |
| 并发 A/B 与旧静默恢复 | authentication-attempts 按开始序号及最近成功排序；state-store 在同步短事务内核对序号与可选 epoch；失败尝试不推进成功序号 |
| 交互与学校故障 | 仅明确 CAS 拒绝/验证码写 epoch 条件交互标记；普通 403/429、缺 execution、二次会话拒绝不返回 3003 |
| 验证码 | 使用时比较 expiresAt 且先删除，一次消费；清理任务只回收 |
| 目标依赖 | recovery 按 CAS→Portal/JW 获取；derived-recovery 按 Portal→mobile 获取；没有 JW 前置 Portal 路径 |
| 独立预算 | 共享任务返回冻结凭证快照、自身45秒预算；等待者独立计时，业务按请求创建客户端，20秒/45秒预算保持 |
| 请求重试 | 生产源码唯一 retryAsync 调用方是 request-executor；CAS POST 和评教提交不可重放，读取最多一次恢复重放 |
| 评教 | 准备与提交使用同会话；批次只选一次，回查增量确认，无确认保持 unknown |
| 原业务规则 | 保留来源顺序、未公布错误原优先级、缓存/OrderedCommit、日历完整采集、交易分页、电费纯解析及独立配额 |
| 旧编排 | CredentialManager、upstream、两个 session executor、Portal reader 与无生产消费者的认证/HTTP兼容出口已删除 |
| 文档 | L3、模块成员地图、根地图、API、ADR、规格与八项任务同步；修改后的生产文件均未超过800行 |

生产 `bun run typecheck` 与最终差异空白检查通过。类型和静态证据不能替代并发运行、真实学校协议或完整客户端验收；既有测试可能保留旧契约或旧导入，本轮未检查其适用性。
