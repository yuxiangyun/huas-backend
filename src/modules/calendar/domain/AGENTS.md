# domain/
> L2 | 父级: /Users/xiangyun/workspace/huas-wechat-app/huas-server/src/modules/calendar/AGENTS.md

成员清单
calendar.ts: 北京本周范围与 RFC 5545 ICS 纯规则，固化 UID、Asia/Shanghai、节次时间和 UTF-8 75-octet 折行

架构决策
domain 的输出对相同输入保持确定性；时钟必须显式传入才能做字节级测试，不能读取应用配置或持久化状态。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
