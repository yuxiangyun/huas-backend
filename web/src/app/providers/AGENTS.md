# providers/
> L2 | 父级: /Users/xiangyun/workspace/huas-wechat-app/huas-server/web/AGENTS.md

成员清单

app-providers.tsx: Web 顶层运行环境，装配 QueryClient 与 Toast，并订阅 JWT 变化同步清空 Query 和 Bearer Blob 会话缓存

架构决策

身份切换失效属于应用生命周期，不下沉到业务页面；订阅回调必须在认证状态写入时同步执行，避免新身份首个请求与异步 Effect 清理竞态。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
