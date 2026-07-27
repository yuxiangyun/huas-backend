# scripts/
> L2 | 父级: /AGENTS.md

成员清单
db-migrate.ts: 显式 SQLite migration 命令，解析数据库路径并执行事务化前向迁移
db-repair.ts: Discover/Treehole 派生计数 dry-run 与幂等修复命令
db-snapshot.ts: SQLite VACUUM INTO 快照命令，要求显式数据库路径与 release 标识
deploy-huas.sh: 快速 rsync 发布脚本，构建并同步代码后快照/迁移数据库，再重载单 PM2 进程。
deploy-huas-zero-downtime.sh: 本地蓝绿发布脚本，把当前工作区快照上传到百度服务器非活动槽。
remote-blue-green-deploy.sh: 远端蓝绿发布核心，以共享数据库快照和迁移成功作为实例启动、nginx 切流前置条件。
setup-huas-git-deploy.sh: Git push 发布初始化器，维护唯一 baidu deploy remote、远端裸仓库与 post-receive hook。

架构决策
scripts/ 只保存可执行运维入口；百度服务器 Git remote 统一命名为 baidu，GitHub remote 统一命名为 github。Git push 发布永远把当前 HEAD 推到远端 main，由远端 hook 进入蓝绿发布流程。
所有维护中的部署路径必须在启动新版本前对明确 DB_PATH 创建 SQLite 一致性快照；快照或 migration 失败立即停止，不得切流或重载进程。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
