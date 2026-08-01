# bootstrap/
> L2 | 父级: /Users/xiangyun/workspace/huas-wechat-app/huas-server/web/AGENTS.md

成员清单

query-client.ts: TanStack Query 单例运行配置，复用 shared/api 标准缓存时间，并统一 4xx 重试、窗口聚焦与网络恢复重验证语义

架构决策

bootstrap 只装配跨实体运行默认值；具体引用数据、后台快照和轮询游标的差异时间由 shared/api 策略定义并由实体 hook 选择。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
