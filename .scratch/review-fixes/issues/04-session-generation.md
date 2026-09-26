# 04-session-generation

What to build: 客户端请求绑定会话代次，旧鉴权失败不能清除同Token新会话，兼顾上传。
Repository: client
Blocked by: 03-ecard-timeout
Status: completed

验收：代码逻辑review覆盖触发条件、成功与失败分支、并发及后续任务兼容性；不依赖测试执行。原有dirty状态不被覆盖或提交。

实现：session 独占单调代次并输出 readonly token/generation 快照；请求与上传分别捕获同一快照用于 Authorization 和鉴权失败校验。成功激活及清理推进代次，普通错误、取消响应和匿名请求不触发清理。

架构复盘与第二轮：没有新增控制器、缓存或持久化状态，只在现有 session 边界增加一个计数器。删除 HTTP 核心直接依赖 storage，由 session 一次提供 token 与代次；响应门闩后以快照存在为副作用准入，避免未来 auth 与快照失配走无条件清理。失败激活不推进代次，并按仍然存在的持久 token 同步 App 副本：既不抹掉健康旧会话，也兼容账号切换已经清空持久 token 的路径。

自查：同 token 新激活、不同 token 新激活、退出再登录、多个旧失败、直接存储漂移、匿名3003、取消后3003、当前3003、写入失败均沿调用链核对；仅启动时从 storage 初始化 App，运行时 token 保存经 activateSession，清理经 clearSession，账号切换的同步存储清空由 token 比较与后续成功激活共同保护。未修改测试，也未运行测试；业务 TypeScript 与 diff --check 仅作机械检查并通过。

文档回环：session/api-core L3 与各自 L2 已同步；无顶级结构变化，L1 无需修改。utils/AGENTS 原 dirty，提交时只暂存本项两行。下一项05修复验证码3002无替换challenge时消费后状态残留，保持当前匿名登录请求和 activateSession 合同。

主审钩子：通过 token/代次绑定、同步账号切换、匿名与取消出口、失败落盘语义审查；批准下一项05后由本项agent提交。提交：client 79ca9290d631b04ec7e58ec6637d53c6dc29fcd3，仅四个本项文件/文档变更，暂存区已清空；原有dirty保留。
