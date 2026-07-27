# calendar/
> L2 | 父级: /Users/xiangyun/workspace/huas-wechat-app/huas-server/src/services/AGENTS.md

成员清单
calendar-subscription-service.ts: Calendar canonical 公开 API 的单向再导出 Facade，保留旧函数名与路径

架构决策
旧 services 路径不再保存订阅实现；签名、15 分钟快照与 ICS 规则唯一归属 modules/calendar。

开发规范
ICS UID、签名链接和缓存复用规则变更必须跑日历订阅测试。

变更日志
2026-07-27: 日历订阅实现迁入 modules/calendar，本文件退化为单向兼容 Facade。
2026-07-16: 日历改走 ScheduleFacade Portal 优先/JW 回退，周快照超过 15 分钟才刷新。
2026-07-16: ICS 内容行改按 UTF-8 octets 折行，续行空格计入 75-octet 上限并保护中文码点完整。
2026-06-30: 播种 calendar 服务 L2 地图。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
