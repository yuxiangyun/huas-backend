# scripts/
> L2 | 父级: /AGENTS.md

成员清单
db-migrate.ts: 唯一 SQLite 结构发布命令，默认拒绝 destructive migration，仅接受明确 `--allow-destructive` 授权
db-repair.ts: 先只读校验当前 schema，再执行 Discover/Treehole 点赞与评论派生计数 dry-run 或幂等修复
db-snapshot.ts: SQLite VACUUM INTO 快照命令，要求显式数据库路径与 release 标识
deploy-huas.sh: 历史快速入口的维护发布别名，统一委托受 destructive migration 门禁保护的远端流程。
deploy-huas-zero-downtime.sh: 保留历史文件名的本地维护发布编排器，上传工作区 release 并明确触发远端停流窗口。
remote-blue-green-deploy.sh: 远端 contract release 核心，严格执行停流与停 writer、快照、destructive migration、Server/Web 冒烟和重新开放流量。
seed-social-test-data.ts: 非生产 Social 测试数据幂等播种器，复用唯一组合根创建本地账户、Community 头像、Treehole 文本帖与 Discover 单图/多图帖。
setup-huas-git-deploy.sh: Git push 维护发布初始化器，维护唯一 baidu deploy remote、远端裸仓库与 maintenance post-receive hook。
test.ts: 全量测试编排器，自动发现套件并以独立 Bun 进程隔离全局模块 mock。

架构决策
scripts/ 只保存可执行运维入口；百度服务器 Git remote 统一命名为 baidu，GitHub remote 统一命名为 github。Git push 发布永远把当前 HEAD 推到远端 main，由远端 hook 进入蓝绿发布流程。
Social 测试播种只能在非生产环境执行；账户不保存学校凭证，图文必须经 canonical application/media 链路写入，重复执行不复制未删除的固定夹具。
所有维护中的部署路径必须先将 nginx 切入 503 maintenance 并停止全部 PM2 writer，再对明确 DB_PATH 创建 SQLite 一致性快照并显式执行 `db:migrate --allow-destructive`。
migration 后只能在新 Server `/health/ready` 与 Web `/m` 本机冒烟同时成功后开放流量；任一失败都必须保持停流与停 writer，不得恢复旧 upstream，只允许 forward-fix。
active-slot 以同目录候选文件原子替换；Web 包管理器按锁文件确定且优先 package-lock。
使用 `mock.module` 的套件必须独立进程执行；普通套件以单并发运行，共享 SQLite 的测试不得并行清理数据。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
