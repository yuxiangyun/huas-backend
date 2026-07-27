# treehole/
> L2 | 父级: /Users/xiangyun/workspace/huas-wechat-app/huas-server/src/services/AGENTS.md

成员清单
treehole-admin-service.ts: 管理侧兼容 Facade，再导出 modules/treehole/composition 的真实作者管理服务
treehole-avatar-media-service.ts: 头像媒体兼容 Facade，保持 src/index.ts 的类名与 cache header 常量出口
treehole-service.ts: Treehole 总门面兼容 Facade，再导出 canonical TreeholeService
treehole-shared.ts: 共享类型/规则/SQL helper 兼容 Facade，保持旧运行时导出与无 policy 参数签名
treehole-user-service.ts: 用户侧兼容 Facade，再导出 canonical TreeholeUserService

架构决策
canonical 实现位于 modules/treehole；本目录仅允许单向再导出，不得重新出现 SQL、事务或媒体实现。

开发规范
计数、通知、头像媒体、删除可见性变更必须跑 treehole 测试。

变更日志
2026-07-27: Treehole 实现迁入 modules/treehole，本目录全部退化为单向兼容 Facade。
2026-06-30: 播种 treehole 服务 L2 地图。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
