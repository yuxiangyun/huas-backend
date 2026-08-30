# infrastructure/
> L2 | 父级: /Users/xiangyun/workspace/huas-wechat-app/huas-server/src/modules/academic/AGENTS.md

成员清单
cache-store.ts: Academic 缓存读写/快照条件失效、singleflight 与 refresh stale fallback 适配入口，复用 canonical Cache 语义
campus-system.ts: Campus Integrations canonical upstream 的 AcademicUpstream 端口实现
runtime.ts: 默认 upstream/cache/fallback 端口实现集合，仅供 composition root 装配
file-schedule-source-policy-store.ts: 原子 JSON、存活 owner 隔离锁目录与文件指纹热加载的课表来源策略 store，新式锁仅在超时且 owner 进程已退出时接管，同时兼容遗留无 PID 锁并在损坏时保留最后快照
evaluation-discovery.ts: 有限遍历可信 JW 导航并发现评教列表；确认主框架有效后隔离次级候选登录页，避免误删共享 JW 会话
grade-cache-key.ts: 以 SHA-256 隐藏成绩查询参数并维持用户前缀 LRU 的缓存键适配
classroom-service-account.ts: 以 CLASSROOM_ADMIN_STUDENT_ID 查询已登录服务账号用户 ID

架构决策
infrastructure 只桥接既有共享基础设施与 Campus Integrations，不复制 cache policy、重试或凭证恢复规则。
课表策略文件默认跟随 DB 数据目录并允许显式覆盖，发布槽只共享状态文件，不共享进程内可变变量。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
