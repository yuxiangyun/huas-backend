# huas-server

湖南文理学院服务后端：Bun + TypeScript + Hono + Drizzle ORM + SQLite；同仓库托管 React/Vite Web。

## 阅读入口

- [架构与关键约束](docs/architecture/ARCHITECTURE.md)：模块边界、认证、并发、学校数据及持久化。
- [校园 API](docs/api/API.md)、[社交 API](docs/api/SOCIAL_API.md)、[管理 API](docs/api/OPERATIONS_API.md)：对外合同。
- [部署与恢复](docs/ops/DEPLOY.md)：发布、迁移、备份、代理与故障处置。
- [协作约定](docs/agents/issue-tracker.md)：任务记录与交付证据边界。

## 目录地图

| 路径 | 职责 |
|---|---|
| `src/` | 应用入口、组合根、领域模块、HTTP、数据库及运行生命周期 |
| `web/` | `/m` 用户端与后台 SPA |
| `tests/` | 业务及协议合同；默认 preload 临时 SQLite |
| `scripts/` | 数据库工具、维护发布与本地质量门禁 |
| `docs/` | 当前架构、接口与运维文档 |
| `data/` | 数据库、媒体及跨发布共享状态，属于持久数据 |
| `public/` | 后端直接托管的静态资源 |
| `.agents/` | Agent 技能资源，按需读取 |

## 配置入口

`package.json` 是命令与依赖事实源；`.env.example` 是配置模板；`src/runtime-config.ts` 负责学校访问参数校验与冻结。`ecosystem.config.cjs` 以 Bun ESM 启动单实例，`nginx.conf` 是独立部署参考模板，实际站点配置须另行核验。

## 开发与审查

1. 中文交流，以“哥”开头；修改前读相关实现、调用方和核心合同。复用现有错误、Logger、HTTP、状态及工具边界。
2. 高层依赖端口。业务规则放 domain/application，协议与存储放 infrastructure；跨模块连接在 composition 完成。
3. 每次修改后审查完整调用链、异常与并发路径，再比较是否存在更简单的职责划分；补改重新审查。用户要求静态验收时，不用测试结果替代代码逻辑判断。
4. 只维护本入口和下列核心专题，不恢复逐目录成员清单或机械文件头要求。已有准确的职责注释可以保留；代码变化时更新真正受影响的合同。单文件超过 800 行时检查职责是否应拆分。
5. 文档只保留当前合同、关键取舍和操作步骤。历史变更由 Git 保存；临时计划、完成台账和重复报告不长期入库。不另建逐次修改日志。
6. 保留已有未提交改动，精确暂存自己的变更。提交、推送、部署分别遵守用户授权；本仓库向 baidu 推送会触发维护发布。

## 运行与验证

- 后端：`bun run dev`；Web：`bun run web:dev`。
- 完整门禁：`bun run check`；Web：`bun run web:typecheck`、`bun run web:build`。以 package.json 实际脚本为准。
- 测试通过默认 preload 使用临时数据库；真实学校 E2E 是单独授权的 `bun run test:e2e`，不得用生产数据库演练。
- `mock.module` 套件经测试脚本独立进程运行，共享 SQLite 的普通套件单并发；`.cases.ts` 由聚合入口导入。后台资料与恢复任务先收尾，再还原 spy/重置数据库，不用 sleep 猜完成。
- 应用启动只校验 schema。迁移必须显式执行，发布流程及失败恢复以部署手册为准。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
