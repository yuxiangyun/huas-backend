# 04：Portal 资料、余额和课表按目标恢复并迁入具名操作

**What to build:** 学校资料、校园卡余额及 Portal 课表统一通过 Portal 目标获取会话，业务保留原有缓存与展示结果，首次登录后的资料请求按需补齐。

**Blocked by:** 03：使用统一请求执行、状态条件提交与配置。

**Status:** completed

## Acceptance criteria

- [x] 建立 Portal 目标恢复，使用 CAS/TGC 而不激活、失效或覆盖 JW；Portal 和 JW 仅共享必要父认证。
- [x] 资料、余额与 Portal 课表改为具名只读操作，业务不拼门户头、token 或恢复步骤。
- [x] Portal 故障保留正确原因和对应冷却，不阻断已经取得的 JW 能力。
- [x] 保留资料回写、OrderedCommit、normal/refresh 合流、课表严格结构及 stale 资格。
- [x] 保留现有窄 reader 兼容接口直到 mobile 完成迁移，但它只能单向委托新恢复实现。
- [x] 删除本切片旧恢复重试分支；生产类型检查和静态消费边界核对通过。

## 验证边界

只允许生产源码类型检查和静态审查。不新增、不读取、不修改、不运行测试，不使用临时复现脚本替代测试，不访问学校上游或生产数据。

## 实施证据

portal.profile、portal.balance、portal.schedule 已迁移；原 OrderedCommit、缓存和资料回写保留。mobile 迁移完成后旧 Portal reader 已删除。 生产类型检查通过；仅有静态证据，未读写或运行测试。最终两轴审查见任务 08。
