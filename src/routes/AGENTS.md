# routes/
> L2 | 父级: /Users/xiangyun/workspace/huas-wechat-app/huas-server/src/AGENTS.md

成员清单
academic/: 教务路由，暴露课表、成绩、评教、空教室 HTTP 接口并调用 academic 服务
admin/: 管理路由，暴露统计、公告、Discover、Treehole 与日志管理接口
auth/: 登录路由，承接 CAS/验证码登录流程并签发本服务 JWT
calendar/: 日历路由，拆分认证 API 与公开 ICS 订阅输出
content/: 公共内容路由，提供免 Bearer 的公告读取接口
discover/: 发现美食路由，解析 multipart/JSON 请求并调用 DiscoverService
portal/: Portal 路由，暴露一卡通、用户资料与 Portal 课表接口
system/: 系统路由，提供健康检查
treehole/: 树洞路由，解析匿名社区请求并调用 Treehole 服务
index.ts: 路由总装配器，挂载 public/auth/calendar 与 /api 受保护子应用

架构决策
路由层只做 HTTP 输入解析、认证边界、日志细节和响应包装；业务事实、事务和上游访问必须下沉到 services。
/api/public 与 /api/admin 在路由总装配器内显式放行，其余 /api 路由统一经过 Bearer authMiddleware。

开发规范
新增路由文件必须有 L3 头部；新增路由子目录必须创建 L2 AGENTS.md 并声明挂载路径。
不要跨路由抽象参数 helper，除非错误消息、默认值和兼容行为完全一致。

变更日志
2026-06-30: 播种 routes L2 地图，明确 HTTP 边界与 /api 认证分界。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
