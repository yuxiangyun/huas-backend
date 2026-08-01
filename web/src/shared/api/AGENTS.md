# api/
> L2 | 父级: /Users/xiangyun/workspace/huas-wechat-app/huas-server/web/AGENTS.md

成员清单

http-client.ts: Web 统一 HTTP 边界，注入 Bearer/Cookie 认证、解析 JSON envelope、处理会话失效，并强制 API 与私有媒体网络请求绕过浏览器持久缓存
media.ts: 公开媒体地址规范化原语，只把服务端版本化相对路径映射为浏览器可读 URL
query-cache-policy.ts: TanStack Query 缓存时间事实源，区分标准数据、静态引用、后台快照、显式强刷旁路与高水位轮询游标生命周期

架构决策

浏览器 HTTP cache 只保存可公开复用的版本化资源；鉴权 JSON 与私有媒体使用 `no-store`，分别由 TanStack Query 内存缓存和有界 Blob LRU 提供会话内复用，避免两层缓存产生不同失效事实。
轮询结果按高水位参数形成短命查询键，其保留期不得继承普通页面数据的分钟级上限；身份切换由应用 Provider 同步清空所有 Query 数据。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
