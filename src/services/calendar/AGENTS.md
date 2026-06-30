# calendar/
> L2 | 父级: /Users/xiangyun/workspace/huas-wechat-app/huas-server/src/services/AGENTS.md

成员清单
calendar-subscription-service.ts: 日历订阅服务，生成签名链接并输出课表 ICS

架构决策
日历服务复用课表缓存和签名能力，不单独保存订阅事实。

开发规范
ICS UID、签名链接和缓存复用规则变更必须跑日历订阅测试。

变更日志
2026-06-30: 播种 calendar 服务 L2 地图。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
