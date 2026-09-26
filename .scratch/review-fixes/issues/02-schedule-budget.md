# 02-schedule-budget

What to build: 统一课表总截止时间，给有序来源和stale返回留预算；处理singleflight等待者预算隔离。
Repository: server
Blocked by: 01-classroom
Status: completed

验收：代码逻辑review覆盖触发条件、成功与失败分支、并发及后续任务兼容性；不依赖测试执行。原有dirty状态不被覆盖或提交。

第一版：Facade 私有等待器统一限制策略读取/current/stale；50秒总量，前48秒按剩余current来源分配，预留2秒缓存。reader端口与独立共享回源预算不变。
架构复盘与第二轮精简：删去吞stale超时的额外wrapper和stale份额分配。stale是本地缓存链，使用同一总截止即可；缓存卡住必须返回超时，不能将等待耗尽伪装成未公布空态。只保留一个waitForSchedule，取消policy非空断言。
固定逻辑review：参数错误立即返回；认证错误优先于stale；来源排序/首选及legacy未公布短路保留；尚未启动的reader在预算耗尽时不调用；Promise.race观察迟到失败，finally释放timer，共享回源按原代次规则提交缓存。日历整学期入口不经Facade，保持45秒独立预算。未运行测试。
下一项：03校园卡客户端预算55秒。主agent最终逻辑review通过，确认预算分摊、共享回源隔离、迟到失败消费、stale超时不伪造空态及下一项接口兼容。按授权独立提交。
