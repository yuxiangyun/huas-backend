# calendar/
> L2 | 父级: /Users/xiangyun/workspace/huas-wechat-app/huas-server/src/routes/AGENTS.md

成员清单
calendar-api.routes.ts: 登录态日历 API，生成 HMAC 订阅链接
calendar-public.routes.ts: 公开日历输出路由，校验 HMAC 签名并返回 ICS

架构决策
订阅链接和 ICS 输出分离：生成链接需要 Bearer，读取 ICS 只信任签名和服务端密钥。

开发规范
签名算法、缓存命中和 ICS UID 规则变更必须跑日历订阅测试。

变更日志
2026-06-30: 播种 calendar 路由 L2 地图。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
