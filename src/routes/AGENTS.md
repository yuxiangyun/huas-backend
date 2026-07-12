# routes/
> L2 | 父级: /Users/xiangyun/workspace/huas-wechat-app/huas-server/src/AGENTS.md

成员清单
academic/: 教务路由，暴露课表、成绩、评教、空教室 HTTP 接口并调用 academic 服务
admin/: 管理路由，暴露会话、分析、统计、公告、Discover、Treehole、日志与 UGC 模式管理接口
auth/: 登录路由，承接 CAS/验证码登录流程并签发本服务 JWT
calendar/: 日历路由，拆分认证 API 与公开 ICS 订阅输出
content/: 公共内容路由，提供免 Bearer 的公告读取接口
discover/: 发现美食路由，解析 multipart/JSON 请求并调用 DiscoverService
portal/: Portal 路由，暴露一卡通、用户资料与 Portal 课表接口
system/: 系统路由，提供健康检查
treehole/: 树洞路由，解析匿名社区请求并调用 Treehole 服务
index.ts: 路由总装配器，挂载 public/auth/calendar 与 /api 受保护子应用，并按 ugcComplianceState 或 ASN+端口规则认证后返回 UGC mock/空态

架构决策
路由层只做 HTTP 输入解析、认证边界、日志细节和响应包装；业务事实、事务和上游访问必须下沉到 services。
/api/public 与 /api/admin 在路由总装配器内显式放行，其余 /api 路由统一经过 Bearer authMiddleware。
`/api/admin/session` 负责建立后台会话，其余管理接口在 admin 子路由内统一经过 adminSessionMiddleware。
UGC 合规守卫位于 app 层以避开 Hono 子应用路径歧义，但必须显式复用 authMiddleware，不能把受保护 GET 变成公共接口；normal 模式放行真实业务，compliance 模式按模块返回后台配置的纯文本 mock 或空分页，不再输出显式 meta；命中 UGC_COMPLIANCE_ASNS 与端口时不读真实 UGC，强制返回空分页/空对象。

开发规范
新增路由文件必须有 L3 头部；新增路由子目录必须创建 L2 AGENTS.md 并声明挂载路径。
不要跨路由抽象参数 helper，除非错误消息、默认值和兼容行为完全一致。

变更日志
2026-07-12: 管理接口升级为 HttpOnly Cookie 会话，并新增渠道分析总览接口。
2026-07-05: UGC 合规拦截响应移除显式 meta，前端只按空数据、空分页或 id=0 mock 收敛反馈入口。
2026-07-02: UGC 守卫支持可信 ASN 头 + 端口命中后自动空读，用于指定网络来源的合规空态。
2026-07-01: UGC 守卫收紧为认证后响应，支持后台 normal/compliance 热开关、分域纯文本 mock 与空分页。
2026-06-30: 播种 routes L2 地图，明确 HTTP 边界与 /api 认证分界。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
