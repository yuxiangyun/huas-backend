# 发布与恢复

本服务以 Bun + PM2 运行，由 Nginx 转发。默认发布入口是 `git push baidu HEAD:main`；该操作会触发停流维护，不是单纯同步代码。健康与运行观测见 [RUNTIME.md](RUNTIME.md)。

## 环境与共享数据

远端需要 Git、rsync、Bun、npm、PM2、curl、SQLite 和 Nginx，并能访问学校 CAS、Portal、JW。共享应用根默认为 `/www/wwwroot/huas-server`，环境变量按根目录 `.env.example` 配置。至少设置有效 `JWT_SECRET`、位于 release 外的绝对 `DB_PATH`，保留 `SERVER_IDLE_TIMEOUT_SECONDS=60`。

蓝绿槽共享 `.env`、数据库、媒体和日志；默认 blue 端口3000、green端口3001，实际运行环境分别位于 `.deploy/current/<slot>`。不要从共享 `.env` 的单个 `PORT` 推断当前活动槽端口。

| 持久对象 | 默认位置/约束 |
|---|---|
| SQLite | `DB_PATH`，应用启动只校验结构，迁移须显式执行 |
| Discover 图片 | `DISCOVER_STORAGE_ROOT`，默认数据库目录下 `discover/` |
| Community 头像 | `COMMUNITY_AVATAR_STORAGE_ROOT`，默认数据库目录下 `treehole-avatars/` |
| Treehole 帖子图片 | `TREEHOLE_STORAGE_ROOT`，默认数据库目录下 `treehole-post-media/` |
| 私信图片 | 数据库目录下 `message-media/` |
| 首页弹窗 | 数据库目录下 `index-popup/`，配置和版本图片须整体保存 |
| 课表来源策略 | 默认数据库目录下 `schedule-source-policy.json`；覆盖 `SCHEDULE_SOURCE_POLICY_FILE` 时须使用 release 外绝对共享路径 |
| 日志 | 共享 `logs/`，包括 PM2 stdout/stderr 和应用日志 |

三类可配置媒体根的相对路径按应用根解析。部署和备份拒绝宽泛系统目录、应用根/数据库父级及互相重叠的媒体根；备份还拒绝资源树符号链接。不要将私有媒体目录直接暴露为 Nginx 静态目录。

## 初始化与日常发布

首次接入前先准备远端共享 `.env`、`data/`、`.deploy`、Nginx 站点及 PM2/Bun 环境；Git 初始化脚本会检查这些前提，不是完整的机器安装器。Nginx 站点须能由维护脚本接管其代理目标。

初始化 Git 发布：

```bash
REMOTE_HOST=baidu \
BARE_REPO_DIR=/www/git/huas-server.git \
APP_DIR=/www/wwwroot/huas-server \
RELEASE_RETENTION_COUNT=6 \
MIN_FREE_DISK_MB=2048 \
scripts/setup-huas-git-deploy.sh
```

它建立 `baidu` remote、远端裸仓库与 `post-receive`。保留数量和磁盘策略固化在 hook 中，调整后应重新运行初始化。之后发布已提交的当前 HEAD：

```bash
git push baidu HEAD:main
```

需要发布本地工作区快照时，使用同一维护内核的备用入口：

```bash
REMOTE_HOST=baidu \
APP_ROOT=/www/wwwroot/huas-server \
scripts/deploy-huas-zero-downtime.sh
```

文件名不代表零停机。`scripts/deploy-huas.sh` 只是该入口的参数兼容别名。不要通过 `git pull + pm2 restart` 绕过维护流程。

两个入口都按以下顺序执行：

1. 保护活动槽与目标 release，仅回收超额非活动 release；准备候选、安装依赖并构建 Web。
2. 检查 release、DB、snapshots 和四类业务媒体实际所在文件系统。门槛取 `MIN_FREE_DISK_MB` 与“SQLite 三倍加业务媒体已用空间”的较大值；不足则在停流前退出。
3. Nginx 切入 maintenance 503，停止 blue、green、legacy 全部 PM2 writer 并保存停止状态。
4. 对明确 `DB_PATH` 创建一致性快照，执行 `db:migrate --allow-destructive`。
5. 只启动目标槽，通过 `/health/ready` 和 `/m` 本机冒烟后，才开放流量并原子更新 `.deploy/active-slot`。

默认 `RELEASE_RETENTION_COUNT=6` 只计算非活动 release，活动槽与目标不占上限。`BUILD_WEB` 必须保持1；Server 与 Web 必须作为同一 release 构建和验收。PM2 直接执行 Bun ESM 入口，不应通过 require wrapper 启动；发布脚本重建目标进程元数据。

## 发布失败与 forward-fix

maintenance 开启后任一步失败，都保持503和全部 writer 停止。迁移可能已经提交，不能根据脚本报错位置推断旧应用仍兼容数据库。

1. 保持停流和停 writer，保存发布输出、目标槽日志、快照文件名和 migration version。
2. 在候选代码上修复问题，重新执行同一维护发布。
3. 只有新 Server `/health/ready` 与 Web `/m` 均通过后才重新开放流量。

不要切回旧 upstream、启动旧槽或强推旧 commit 代替 forward-fix。快照恢复属于明确接受数据丢失窗口的独立事故恢复流程。

## 数据库操作

以下路径是示例；操作前替换为目标环境的明确路径。生产迁移必须已经停流、停 writer 并完成快照。

```bash
bun run db:snapshot -- --db ./data/huas.db --output-dir ./data/snapshots --release before-maintenance
bun run db:migrate -- --db ./data/huas.db --allow-destructive
```

迁移来自不可变的 `src/db/migrations/`，每个版本在独立 immediate transaction 中执行。已有库 baseline adoption 必须通过结构 fingerprint 检查；不要修改已发布 migration 或手写版本记录绕过失败。首次空库同样须在启动应用前显式迁移。

`db:snapshot` 先执行 `PRAGMA quick_check`，再以 `VACUUM INTO` 创建 SQLite 一致性副本，不复制媒体。快照文件包含 UTC 时间、schema version 和 release 标识。`data/snapshots/` 不自动回收，应按明确文件名和保留策略人工管理。

派生计数出现漂移时，先检查影响，再执行修复：

```bash
bun run db:repair -- --db ./data/huas.db --dry-run
bun run db:repair -- --db ./data/huas.db
```

该命令只重算 Discover/Treehole 点赞和未删除评论计数，在事务内更新不一致帖子；重复执行应报告0。

## 备份与恢复

从开发电脑运行：

```bash
REMOTE_HOST=baidu \
APP_ROOT=/www/wwwroot/huas-server \
LOCAL_BACKUP_DIR=/absolute/backup/database \
LOCAL_MEDIA_BACKUP_DIR=/absolute/backup/media \
scripts/backup-data-local.sh
```

该入口复用远端当前 release 的 `db-snapshot`，将数据库和四类社交媒体、首页弹窗通过同一数据流传回；本机校验 SQLite、tar 完整性与条目白名单后落盘。省略本机目录时默认保存到工作区 `backups/database` 与 `backups/media`，文件用同一 UTC 标识配对。

SQLite 在线快照是一致的，但媒体归档与数据库不是跨资源事务；要求完整时间点灾备时，应先停流、停全部 writer，再成组备份。脚本不包含 `.env`、日志或课表来源等其他运行策略文件，也不会自动删除旧本机备份；环境和策略须另外保存。

恢复时：

1. 保持 maintenance 和全部 writer 停止，明确接受快照后写入丢失范围。
2. 将目标数据库恢复到新路径，执行 `PRAGMA quick_check`，再原子切换明确的 `DB_PATH`。
3. 把归档中 `media/discover`、`media/treehole-avatars`、`media/treehole-post-media`、`media/message-media` 恢复到各自运行根；`media/index-popup` 连同配置和图片整体恢复到数据库目录下 `index-popup`。不要直接发布归档顶层 `media/`。
4. 核对环境和运行策略，使用与 schema 兼容的 release 校验 readiness 后再开放流量。

## 代理预算与排障

根 `nginx.conf` 是独立部署参考模板；维护脚本只向活动 include 写入 `proxy_pass` 或 `return 503`，不会自动安装模板或重写既有站点超时。默认 include 是 `/www/server/panel/vhost/nginx/huas-server-active-proxy.inc`。

用 `nginx -T` 核对实际 `/api`、`/auth` location 及其继承配置，保证有效 `proxy_read_timeout` 至少60秒，覆盖学校请求45秒与课表仲裁50秒预算。Bun 默认 idle timeout同为60秒。修改已有配置的归属上下文并执行 `nginx -t`，避免在同一 location 重复声明。代理读超时是两次上游读取间隔，业务总截止时间仍由应用控制。

站点还须转发 `/m`、`/health`、`/metrics` 和媒体接口，请求体上限覆盖64MB原图与 multipart 开销（建议至少 `70m`）。模板变更须另行应用并核对有效配置。

常用只读排障入口：

```bash
cat /www/wwwroot/huas-server/.deploy/active-slot
pm2 status --no-color
pm2 logs huas-server-blue --lines 100
pm2 logs huas-server-green --lines 100
```

按实际活动槽端口请求 `/health/ready`。502时对照 Nginx error log、应用耗时和生效超时；readiness失败先查本地DB/schema，不以学校故障解释。Web冒烟失败检查候选 `web/dist/index.html` 和构建日志，在候选修复后重跑维护发布，不手工改活动产物。

课表返回 `_meta.stale=true` 或 `refresh_failed=true` 时，先看 `last_error`：3004为预算超时，3005为暂时上游/恢复故障；只有明确凭据拒绝或验证码要求才归3003并需要用户重新认证。普通学校故障不应要求用户反复登录。

## 课表来源策略

后台 Cookie 会话保护的 `/api/admin/academic/schedule-source-policy` 支持 GET 和 PUT `{"mode":"mobile-jw-first"}`。合法模式为 `mobile-jw-first`、`jw-first`、`portal-first`；没有有效持久状态时才读取环境初值，默认 `mobile-jw-first`。

切换只影响后续请求，不清缓存或主动回源；请求内使用固定策略快照。核对 GET 的模式、更新时间、操作人及响应 `_meta.policy_mode`。策略文件须处于共享持久目录；损坏时保留最后有效快照并告警，修复文件或再次 PUT 后恢复传播。不要删除缓存来验证顺序。

## JWT 密钥轮换

`JWT_SECRET` 同时参与服务令牌签名和 `users.encrypted_password` 加密，不能仅修改环境变量并重启，否则保存的学校密码无法解密。专用入口为 `scripts/rotate-self-jwt-secret-remote.sh`：先核验旧密码可解密，在停流、停 writer 和备份后事务重加密，同步共享及槽位环境与 PM2，再验证密码重加密结果、readiness 与新旧 JWT 鉴权边界后开放流量。操作前阅读脚本参数及目标范围，不把普通发布当作密钥迁移。
