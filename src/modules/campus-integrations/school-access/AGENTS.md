# school-access/
> L2 | 父级: /src/modules/campus-integrations/AGENTS.md

成员清单
school-login-context.ts: SQLite 基础凭证统一写入及真实认证提交原语，推进 epoch、写实际基础凭证、清理缺失 Portal 与旧派生会话；保留 Portal-only 不改 JW 的约束。
recovery-cooldown.ts: epoch 绑定的有界五秒失败窗口，读取不续期，真实登录换代自动淘汰。
derived-recovery.ts: 两种 Portal 派生会话的恢复协调，按原父快照失效、按 epoch 提交，只共享冻结字符串快照。
mobile-operations.ts: 移动课表、月交易分页与 electric config/account 具名读取，保留各系统失效证据与业务 stale 资格。
portal-operations.ts: Portal 资料、余额与日期课表协议，解析后交原业务层缓存和有序回写。
schedule-operation.ts: JW 周课表只读 POST，保留未公布与合法空表的区别。
classroom-operations.ts: 服务账号的空教室及楼栋协议，审计身份与参数规范化留在 Academic。
evaluation-operations.ts: 评教发现、列表及同会话准备/单次提交；写结果不确定交业务回查，不重放提交。
request-executor.ts: 统一有限重试、一次会话恢复重放与共享任务独立等待；每个请求使用只读配置快照。
errors.ts: 统一交互、会话拒绝、不可用、超时及传输归一化；协议错误保留业务元信息，普通学校故障一律非 401。
recovery.ts: CAS 用户级与 Portal/JW 目标级合流，按目标恢复并条件提交，固定 epoch 冷却不续期。
base-read.ts: 内部 Portal/JW 只读执行组合，独立客户端与按快照失效不暴露给业务。
grade-operation.ts: 成绩只读 POST 及评教门禁发现，缓存与 fresh-first 策略仍归 Academic。
evaluation-discovery.ts: 保留 JW 导航有限遍历及局部登录页隔离的协议实现，被成绩和评教操作复用。
operations.ts: 静态具名操作目录及输入输出类型映射，拒绝任意 URL 和客户端回调。
authentication.ts: 学校真实身份认证与验证码挑战，CAS 成功立即条件提交身份，不激活学校业务系统或回填资料。
authentication-attempts.ts: 单 writer 进程的有界在途认证排序，只有较新成功阻止旧候选提交，最后一个调用结束即回收。
state-store.ts: 学校认证的 SQLite 短事务与身份快照，统一用户密码、epoch、基础凭证及交互标记的提交边界。
school-access.ts: 学校访问公开入口及窄维护入口，Identity 只消费认证结果，不理解学校协议。

架构决策
学校协议细节及凭证状态在模块内部闭环，对外只交付认证身份或具名学校操作结果。业务缓存、JWT 与客户端响应不属于本模块。
恢复协调按 CAS→Portal/JW、Portal→mobile 目标依赖合流；共享任务有自身 45 秒预算，各等待者单独限时。唯一执行器调度临时重试及一次会话恢复重放；CAS POST 与评教提交最多一次。
真实认证排序在 CAS 前获取租约，同账号全部在途调用结束后回收；持久化在同一同步短事务核对租约和可选 epoch，不依赖完成时间排序。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
