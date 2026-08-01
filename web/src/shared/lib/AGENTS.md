# lib/
> L2 | 父级: /Users/xiangyun/workspace/huas-wechat-app/huas-server/web/AGENTS.md

成员清单

cn.ts: Tailwind class 合并原语，统一条件类名与冲突消解
image-upload-processing.ts: 浏览器图片上传准备层，串行执行像素门禁、最长边缩放、静态 WebP 压缩与单图/总字节硬校验，无法达到目标字节时在上传前拒绝，供 Social 图文入口复用

架构决策

shared/lib 只承载无业务实体语义的浏览器纯能力；上传准备降低客户端流量与解码峰值，但服务端仍是格式、像素和成品上限的最终安全边界。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
