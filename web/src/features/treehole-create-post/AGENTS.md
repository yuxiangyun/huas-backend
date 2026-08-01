# treehole-create-post/
> L2 | 父级: /Users/xiangyun/workspace/huas-wechat-app/huas-server/web/AGENTS.md

成员清单

model/create-treehole-post-schema.ts: Treehole 正文必填校验契约，长度上限只消费服务端 meta
model/treehole-image-processing.ts: 把 Treehole 动态限制映射到 shared/lib 串行最长边/WebP 上传准备层，无法可靠解码的格式保留给后端处理

架构决策

前端图片处理只优化日常上传，不替代服务端真实格式、动画、像素与成品硬限制；处理失败时仅在文件仍满足服务端字节边界时保留原图。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
