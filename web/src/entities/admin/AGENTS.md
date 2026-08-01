# admin/
> L2 | 父级: /Users/xiangyun/workspace/huas-wechat-app/huas-server/web/AGENTS.md

成员清单
api/admin-api.ts: 后台 HTTP 适配边界，统一管理会话、业务资源、首页弹窗底部动作三态 multipart 设置、私信只读与运行查询的路径和传输契约
api/admin-queries.ts: TanStack Query 服务器状态编排层，以 15 秒新鲜/5 分钟保留读取后台快照，向页面提供首页弹窗三态写回、短命私信游标与 mutation hooks
model/admin-query-keys.ts: 后台资源缓存命名边界，隔离内容、首页弹窗三态设置、私信会话/消息和运行状态身份
model/admin-types.ts: 后端管理接口的协议模型，包含首页弹窗底部动作三态、Community 参与者、Treehole 私有图片和 Messaging 只读 DTO

架构决策
后台实体只适配当前生产管理能力；首页弹窗使用单资源 GET/PUT 与 multipart 可选换图，底部动作严格收敛为公众号跳转、纯文字、无底部内容三态，成功响应作为唯一缓存快照；Treehole 图片只暴露管理 Cookie URL，Messaging 仅暴露会话、增量、历史和私有媒体读取，不创建任何写入命令或兼容入口。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
