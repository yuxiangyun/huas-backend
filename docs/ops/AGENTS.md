# docs/ops/
> L2 | 父级: docs/AGENTS.md

成员清单
DEPLOY.md: 部署与运维手册，覆盖 release 保留/四媒体存量磁盘门禁、SQLite migration/repair/snapshot、首页弹窗共享状态及成组恢复、数据库与白名单资源备份、孤儿回收、私有媒体灾备与停流 forward-fix 门禁。
RUNTIME.md: Runtime 健康探针、Prometheus 轻量指标、本地/CI 质量门与正常关闭 flush 接线说明

架构决策
运维文档独立归档，避免部署知识与接口、架构描述互相缠绕。
发布手册以 maintenance 开启为失败收敛分界：停流前可安全退出，停流后必须保持 maintenance 与停 writer，migration 后只允许 forward-fix。
release 清理只作用于受控目录的非活动直接子目录，活动蓝绿槽不受数量上限影响；磁盘门禁按解析后的路径分别检查 release、DB、snapshots 与四类媒体所在文件系统，不自动删除业务快照。
SQLite 快照、Discover/Community/Treehole/Messaging 四类业务媒体与首页弹窗配置/海报是独立持久层对象；运维入口拒绝宽泛、重叠或会覆盖应用/数据库的持久根，本机备份还拒绝资源树中的符号链接，并以相同 UTC 标识成组保存数据库和固定 tar 白名单，明确排除日志与环境配置。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
