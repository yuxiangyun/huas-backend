# docs/ops/
> L2 | 父级: docs/AGENTS.md

成员清单
DEPLOY.md: 部署与运维手册，覆盖 Bun、PM2、SQLite migration/repair/snapshot、停流维护发布、Git push hook 与 migration 后 forward-fix 门禁。
RUNTIME.md: Runtime 健康探针、Prometheus 轻量指标、本地/CI 质量门与正常关闭 flush 接线说明

架构决策
运维文档独立归档，避免部署知识与接口、架构描述互相缠绕。
发布手册以 maintenance 开启为失败收敛分界：停流前可安全退出，停流后必须保持 maintenance 与停 writer，migration 后只允许 forward-fix。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
