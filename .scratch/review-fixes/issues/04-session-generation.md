# 04-session-generation

What to build: 客户端请求绑定会话代次，旧鉴权失败不能清除同Token新会话，兼顾上传。
Repository: client
Blocked by: 03-ecard-timeout
Status: pending

验收：代码逻辑review覆盖触发条件、成功与失败分支、并发及后续任务兼容性；不依赖测试执行。原有dirty状态不被覆盖或提交。
