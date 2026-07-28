# types/
> L2 | 父级: /Users/xiangyun/workspace/huas-wechat-app/huas-server/src/AGENTS.md

成员清单
heic-convert.ts: heic-convert 模块声明补丁，补齐第三方库类型缺口
index.ts: 共享业务 DTO 与 API 响应类型，包含成绩 passStatus、缓存状态及课表策略观测 meta，服务、解析器与路由共同使用

架构决策
types 只描述结构，不引入运行时代码；第三方声明补丁与业务 DTO 分开。

开发规范
新增 DTO 必须服务真实跨模块边界，避免为单文件局部结构制造全局类型。

变更日志
2026-07-27: 为 heic-convert 声明补充 L3 契约，类型协议保持不变。
2026-07-05: CacheMeta 移除 ugcCompliance 标记，前端不再读取显式合规 meta。
2026-06-30: 成绩 DTO 增加 passStatus，避免客户端把未知成绩误判为不通过。
2026-06-30: 播种 types L2 地图。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
