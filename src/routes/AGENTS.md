# routes/
> L2 | 父级: /src/AGENTS.md

成员清单
academic/: 教务路由，暴露课表、成绩、评教、空教室 HTTP 接口并调用 academic 服务
admin/: Operations 管理 HTTP factory 的兼容再导出路径，真实路由实例由根组合创建
auth/: 登录路由，承接 CAS/验证码登录流程并签发本服务 JWT
calendar/: Calendar HTTP 兼容 Facade，保持认证 API 与公开 ICS 订阅原挂载路径
content/: Operations 公共公告/首页弹窗 HTTP 兼容 Facade，保持免 Bearer 挂载路径
portal/: Portal/校园生活路由，保留一卡通余额/用户资料/课表，并挂载使用独立限流的 mobile-yxt 有界月份账单和电费只读接口
system/: Operations 健康 HTTP 兼容 Facade，保持 `/health` 挂载路径
index.ts: 路由协议总装配器，显式挂载 `/api/public/discover` 只读表，定义 public/admin 与其余 `/api` Bearer 边界，并装配根组合 routes
schedule-route-log.ts: 双源课表共享日志适配器，记录 policy/primary/source/fallback 低基数摘要但不参与来源决策
social-summary.routes.ts: `/api/social/unread-summary` 跨域只读聚合器，并行组合 Messaging 未读与 Notifications 摘要窄端口

架构决策
路由层只做 HTTP 输入解析、认证边界、日志细节和响应包装；业务事实、事务和上游访问必须下沉到 canonical modules。
/api/public（含 Discover 匿名只读表）与 /api/admin 在路由总装配器内显式放行，其余 /api 路由统一经过 Bearer authMiddleware；公开路由自身不得注册写操作或用户主页读取。
`/api/admin/session` 负责建立后台会话，其余管理接口在 admin 子路由内统一经过 adminSessionMiddleware。

开发规范
新增路由文件必须有 L3 头部；新增路由子目录必须创建 L2 AGENTS.md 并声明挂载路径。
不要跨路由抽象参数 helper，除非错误消息、默认值和兼容行为完全一致。

变更日志
2026-07-31: 删除 Discover/Treehole 旧路由 Facade 与内容空读守卫，总装配器直接挂载 canonical HTTP adapters。
2026-07-31: 总装配器改为接收根组合生成的社交/管理路由实例，不再 import 社交 concrete singleton。
2026-07-31: 挂载根组合注入的 `/api/notifications` 活动通知路由，沿用统一 Bearer 认证边界。
2026-07-31: 挂载根组合注入的 `/api/messaging` 私信路由，媒体读取和写操作共用 Bearer 认证边界。
2026-08-01: 新增 `/api/social/unread-summary` 单请求聚合，减少导航角标轮询但保持 Messaging/Notifications 事实隔离。
2026-07-27: 管理、公共公告与健康 HTTP 实现迁入 modules/operations/http，旧路径保留单向 Facade。
2026-07-27: Calendar 路由实现迁入 modules/calendar/http，旧路径保留单向 Facade。
2026-07-18: 抽取 JW/Portal 双源课表的同构日志映射，业务入口与 fallback 语义继续独立。
2026-07-12: 管理接口升级为 HttpOnly Cookie 会话，并新增渠道分析总览接口。
2026-06-30: 播种 routes L2 地图，明确 HTTP 边界与 /api 认证分界。
2026-08-23: 新增受 Bearer 保护的 `/api/ecard/overview` 与 `/api/utilities/electricity`，旧 `/api/ecard` 路由合同保持不变。
2026-08-29: 显式挂载 `/api/public/discover` 元数据、Feed、详情和评论只读表，其余 Discover 能力继续统一经过 Bearer。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
