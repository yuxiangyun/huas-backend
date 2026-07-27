# infrastructure/
> L2 | 父级: /Users/xiangyun/workspace/huas-wechat-app/huas-server/src/modules/academic/AGENTS.md

成员清单
cache-store.ts: Academic 缓存与 refresh stale fallback 适配入口，复用既有 SQLite 语义
campus-system.ts: Campus Integrations canonical upstream 的 AcademicUpstream 端口实现
runtime.ts: 默认 upstream/cache/fallback 端口实现集合，仅供 composition root 装配
evaluation-discovery.ts: 有限遍历可信 JW 导航并发现评教列表，供成绩门禁与评教共用
grade-cache-key.ts: 以 SHA-256 隐藏成绩查询参数并维持用户前缀 LRU 的缓存键适配
classroom-service-account.ts: 以 CLASSROOM_ADMIN_STUDENT_ID 查询已登录服务账号用户 ID

架构决策
infrastructure 只桥接既有共享基础设施与 Campus Integrations，不复制 cache policy、重试或凭证恢复规则。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
