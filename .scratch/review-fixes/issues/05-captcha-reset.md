# 05-captcha-reset

What to build: 3002且未返回新挑战时清除已消费的旧验证码session/image，保留可继续登录入口。
Repository: client
Blocked by: 04-session-generation
Status: pending

验收：代码逻辑review覆盖触发条件、成功与失败分支、并发及后续任务兼容性；不依赖测试执行。原有dirty状态不被覆盖或提交。
