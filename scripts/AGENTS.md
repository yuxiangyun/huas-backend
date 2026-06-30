# scripts/
> L2 | 父级: /AGENTS.md

成员清单
deploy-huas.sh: 快速 rsync 发布脚本，构建 Web、同步代码并重载单 PM2 进程。
deploy-huas-zero-downtime.sh: 本地蓝绿发布脚本，把当前工作区快照上传到百度服务器非活动槽。
remote-blue-green-deploy.sh: 远端蓝绿发布核心，安装依赖、构建前端、健康检查并切换 nginx 流量。
setup-huas-git-deploy.sh: Git push 发布初始化器，维护唯一 baidu deploy remote、远端裸仓库与 post-receive hook。

架构决策
scripts/ 只保存可执行运维入口；百度服务器 Git remote 统一命名为 baidu，GitHub remote 统一命名为 github。Git push 发布永远把当前 HEAD 推到远端 main，由远端 hook 进入蓝绿发布流程。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
