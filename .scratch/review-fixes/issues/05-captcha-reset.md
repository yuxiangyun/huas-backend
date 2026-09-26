# 05-captcha-reset

What to build: 3002且未返回新挑战时清除已消费的旧验证码session/image，保留可继续登录入口。
Repository: client
Blocked by: 04-session-generation
Status: completed

验收：代码逻辑review覆盖触发条件、成功与失败分支、并发及后续任务兼容性；不依赖测试执行。原有dirty状态不被覆盖或提交。

实现：登录响应通过原有存活/可见/operation/requestId/输入快照校验后统一投影验证码状态；仅完整新 challenge 可替换，3002、拒绝及临时错误均不复用旧 session/image。网络异常和携带挑战请求的取消也清空，refresh 加载保留占位但去掉旧图，失败/取消恢复普通登录入口，无自动 CAS 重放。

架构复盘与第二轮：提取既有纯错误文案和验证码响应投影为 login-feedback.ts，页面保留请求生命周期，login.ts 降至 800 行以内。第二轮复用 clearLoginError 与 createCaptchaState，删除 credential reset 重复计时器/错误字段清理；取消条件统一覆盖 login 与 refresh，不增加 pending challenge 状态或新 controller。

自查：确认完整/缺字段 challenge、3002 无 challenge、密码拒绝、3005/超时、网络异常、刷新成功/失败、输入变化/页面隐藏/卸载、迟到响应、finally loading 与下一项测试契约迁移边界。静态类型检查和 diff --check 通过，不运行测试。下一项 06a upstream/evaluation/cache 兼容测试契约迁移。本项只提交小程序的 login.ts、login-feedback.ts、局部 AGENTS.md；本台账留待后端汇总提交。

主审补改：将通用错误的空文案分支前置，避免普通空消息被解释为验证码问题；只有明确验证码文案才进入挑战提示。补改后再次检查纯投影与页面生命周期边界，无新增状态/分支抽象，等待主审复查。

主审补改复查通过，已批准仅三个客户端 login 文件提交：4be9b9a1292591fea2be77516e3f3fa38622f693（修复登录一次性验证码失效后的重试状态）。既有 dirty 未纳入，无 push/deploy。
