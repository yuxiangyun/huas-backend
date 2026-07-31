# docs/ops/
> L2 | 父级: docs/AGENTS.md

成员清单
DEPLOY.md: 部署与运维手册，覆盖 SQLite migration/repair/snapshot、废弃旧社交事实的 contract 演练、永久通知、message-media 灾备与停流 forward-fix 门禁。
RUNTIME.md: Runtime 健康探针、Prometheus 轻量指标、本地/CI 质量门与正常关闭 flush 接线说明

架构决策
运维文档独立归档，避免部署知识与接口、架构描述互相缠绕。
发布手册以 maintenance 开启为失败收敛分界：停流前可安全退出，停流后必须保持 maintenance 与停 writer，migration 后只允许 forward-fix。
SQLite 快照与私信媒体是两个独立持久层对象；完整灾备必须同时保存数据库和 dirname(DB_PATH)/message-media，且私信媒体不能配置成公开静态目录。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
