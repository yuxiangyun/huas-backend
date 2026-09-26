# 03-ecard-timeout

What to build: 校园卡余额和月账单客户端覆盖服务端45秒预算，电费保持20秒服务/30秒客户端合同。
Repository: client
Blocked by: 02-schedule-budget
Status: completed

验收：代码逻辑review覆盖触发条件、成功与失败分支、并发及后续任务兼容性；不依赖测试执行。原有dirty状态不被覆盖或提交。

第一版：portalApi 将余额和月账单统一到 ECARD_REQUEST_TIMEOUT_MS=55000；电费独立 ELECTRICITY_REQUEST_TIMEOUT_MS=30000。同步 portal.ts L3 与 api/AGENTS.md 的 portal 行。
架构复盘与第二轮精简：端点域内两个命名常量已是最小表达，共享校园卡预算避免余额/账单双处漂移；不创建全局预算注册表，不修改 api-core、服务端聚合或刷新语义。无必要的额外改写。
固定逻辑review：三个 Promise 方法均委托对应 handle；预算透传 wx.request，取消仍 settle 后 abort，成功/网络错误仍统一转换；只增加余额和月账单等待上限，没有增加重试/并发/状态。校验端点 55/55/30 秒映射及 L3/L2，L1 无结构变化。未运行测试，diff --check 通过。
下一项：04 客户端会话代次，预计改 session/api-core，复用现有 portalApi 调用链无冲突；提交前待主agent独立逻辑review。已有培养方案文档修改将仅保留工作树，提交仅选 portal 文档行。

主agent最终逻辑review通过：55/55/30秒映射、Promise/handle共用实现、取消/刷新/鉴权边界和下一项兼容性均确认。客户端独立提交 56edc7816b8bcddd50bf0c5d07437c37abc224b8；精确暂存仅 portal.ts 和 api/AGENTS.md 的 portal 行，原有培养方案修改保留。
