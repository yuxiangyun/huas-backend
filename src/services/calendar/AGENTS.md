# calendar/
> L2 | 父级: /Users/xiangyun/workspace/huas-wechat-app/huas-server/src/services/AGENTS.md

成员清单
calendar-subscription-service.ts: 日历订阅服务，复用双源课表门面、15 分钟周快照刷新与 RFC 5545 UTF-8 折行

架构决策
日历服务复用课表门面、缓存和签名能力，不单独保存订阅事实；新鲜周快照避免轮询回源，超过 15 分钟刷新并保留双源容灾。

开发规范
ICS UID、签名链接和缓存复用规则变更必须跑日历订阅测试。

变更日志
2026-07-16: 日历改走 ScheduleFacade Portal 优先/JW 回退，周快照超过 15 分钟才刷新。
2026-07-16: ICS 内容行改按 UTF-8 octets 折行，续行空格计入 75-octet 上限并保护中文码点完整。
2026-06-30: 播种 calendar 服务 L2 地图。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
