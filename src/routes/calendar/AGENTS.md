# calendar/
> L2 | 父级: /Users/xiangyun/workspace/huas-wechat-app/huas-server/src/routes/AGENTS.md

成员清单
calendar-api.routes.ts: 登录态日历 API 兼容 Facade，再导出 modules/calendar/http canonical 路由
calendar-public.routes.ts: 公开 ICS 路由兼容 Facade，保持 routes/index.ts 旧挂载路径

架构决策
订阅链接和 ICS 输出分离：生成链接需要 Bearer，读取 ICS 只信任签名和服务端密钥；真实协议实现已归属 modules/calendar/http。

开发规范
签名算法、缓存命中和 ICS UID 规则变更必须跑日历订阅测试。

变更日志
2026-07-27: 旧路由退化为 Calendar canonical HTTP 的单向再导出 Facade。
2026-06-30: 播种 calendar 路由 L2 地图。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
