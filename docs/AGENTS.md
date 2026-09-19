# docs/
> L2 | 父级: /AGENTS.md

成员清单
agents/: 本地任务跟踪、分流状态与领域文档的协作约定。
adr/: 已确认架构与产品契约的取舍记录，逐项标注实施状态，避免将设计决定误认作已运行行为。
api/: API 契约与前端接入文档，聚合校园接口及社交用户/管理面的可执行协议。
architecture/: 架构地图，保存后端整体架构、社交一致性边界与移动端 Web 架构。
ops/: 运维手册，记录部署、破坏性迁移、发布与线上维护路径。

架构决策
docs/ 只承载 Markdown 语义相；代码实现仍以 src/、web/ 为机器相。
专题文档按 api、architecture、ops 归档；跨模块决策保存在 adr，根 CONTEXT.md 只保存领域术语。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
