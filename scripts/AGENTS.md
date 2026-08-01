# scripts/
> L2 | 父级: /AGENTS.md

成员清单
backup-data-local.sh: 从远端当前 release 成组拉回经二次 quick_check 的 SQLite 快照、四类社交媒体与首页弹窗配置/海报，拒绝宽泛/重叠/含符号链接的持久根并在解压前拒绝越界条目
db-migrate.ts: 唯一 SQLite 结构发布命令，默认拒绝 destructive migration，仅接受明确 `--allow-destructive` 授权
db-repair.ts: 先只读校验当前 schema，再执行 Discover/Treehole 点赞与评论派生计数 dry-run 或幂等修复
db-snapshot.ts: SQLite VACUUM INTO 快照命令，要求显式数据库路径与 release 标识
deploy-huas.sh: 历史快速入口的维护发布别名，统一委托受 destructive migration 门禁保护的远端流程。
deploy-huas-zero-downtime.sh: 保留历史文件名的本地维护发布编排器，上传工作区 release，透传 release 保留/磁盘余量策略并明确触发远端停流窗口。
remote-blue-green-deploy.sh: 远端 contract release 核心，先安全淘汰非活动 release 并按解析后的数据库与四媒体根执行存量感知磁盘门禁，再严格执行停流、停 writer、快照、migration 与冒烟开放流量。
seed-social-test-data.ts: 非生产 Social 测试数据幂等播种器，复用唯一组合根创建本地账户、Community 头像、Treehole 文本帖与 Discover 单图/多图帖。
setup-huas-git-deploy.sh: Git push 维护发布初始化器，维护唯一 baidu deploy remote、远端裸仓库与固化 release 保留/磁盘门禁配置的 maintenance post-receive hook。
test.ts: 全量测试编排器，自动发现套件并以独立 Bun 进程隔离全局模块 mock。

架构决策
scripts/ 只保存可执行运维入口；百度服务器 Git remote 统一命名为 baidu，GitHub remote 统一命名为 github。Git push 发布永远把当前 HEAD 推到远端 main，由远端 hook 进入蓝绿发布流程。
本机异地备份复用远端 `db-snapshot` 的 `VACUUM INTO` 一致性语义，并只打包互不重叠、非宽泛且不含符号链接的四类社交媒体根与固定 `dirname(DB_PATH)/index-popup`；远端临时文件必须自动清理，本机必须在解压前校验 tar 白名单，数据库通过二次 `quick_check`、资源包通过完整性检查后才就位。
Social 测试播种只能在非生产环境执行；账户不保存学校凭证，图文必须经 canonical application/media 链路写入，重复执行不复制未删除的固定夹具。
所有维护中的部署路径必须先将 nginx 切入 503 maintenance 并停止全部 PM2 writer，再对明确 DB_PATH 创建 SQLite 一致性快照并显式执行 `db:migrate --allow-destructive`。
候选 release 准备前只可淘汰 `.deploy/releases` 直接子目录中的非活动版本，blue/green 当前链接与本次目标必须硬保护；候选构建后必须解析 `.env` 的数据库/三类可配置媒体根与固定 Messaging 根，以数据库快照及四媒体存量安全余量检查各实际文件系统，失败时安全退出且不得开启 maintenance。
migration 后只能在新 Server `/health/ready` 与 Web `/m` 本机冒烟同时成功后开放流量；任一失败都必须保持停流与停 writer，不得恢复旧 upstream，只允许 forward-fix。
active-slot 以同目录候选文件原子替换；Web 包管理器按锁文件确定且优先 package-lock。
PM2 必须以 `interpreter: none` 直接执行 `bun run src/index.ts`；目标槽每次停写后重建进程元数据，禁止让 `startOrReload` 保留旧 script path，也禁止经 Bun require wrapper 装载含顶层异步初始化的 ESM 入口。
使用 `mock.module` 的套件必须独立进程执行；普通套件以单并发运行，共享 SQLite 的测试不得并行清理数据。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
