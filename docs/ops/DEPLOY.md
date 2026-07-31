# HUAS Server 部署与运维手册

本文档当前维护中的部署链路：

- 运行方式：`Bun + PM2`
- 历史快速入口：`scripts/deploy-huas.sh`（已收敛为维护发布别名）
- 本地维护发布：`scripts/deploy-huas-zero-downtime.sh`（保留文件名，不再承诺零停机）
- Git Push 维护发布：`git push baidu HEAD:main`

仓库中的 Docker 相关部署文件已经移除，不再作为维护入口。

## 1. 服务器要求

| 项目 | 最低配置 | 推荐配置 |
|---|---|---|
| CPU | 1 核 | 2 核 |
| 内存 | 512 MB | 1 GB |
| 硬盘 | 5 GB | 10 GB |
| 系统 | Ubuntu 20.04+ / Debian 11+ | Ubuntu 22.04 LTS |
| 网络 | 能访问学校 CAS / Portal | 校园网内或有校园网出口 |

必须确认服务器能访问：

- `cas.huas.edu.cn`
- `portal.huas.edu.cn`

## 2. 当前维护策略

当前只维护四种操作：

1. 服务器上使用 PM2 直接运行服务
2. `scripts/deploy-huas.sh` 作为历史别名委托同一维护发布内核
3. 本地通过 `scripts/deploy-huas-zero-downtime.sh` 上传 release，远端显式停流与停 writer 后执行 contract migration
4. 本地通过 `git push baidu HEAD:main` 推送到服务器裸仓库，由 `post-receive` hook 执行同一维护发布

所有发布入口共享一条不可绕过的顺序：停流/停 writer → snapshot → `db:migrate --allow-destructive` → 新 Server/Web 本机冒烟 → 开放流量。

> 社交 0003 与旧 Web 契约不兼容。后端重构与独立前端适配尚未同时完成时，禁止执行真实发布；必须把消费统一 author、Discover 点赞、Notifications 和 Messaging 新接口的 Web 与新 Server 放入同一 release，再进入维护窗口。

不再维护以下链路：

- Docker
- Docker Compose
- 根目录 `deploy.sh`

## 3. 首次部署

### 3.1 安装 Bun

```bash
curl -fsSL https://bun.sh/install | bash
source ~/.bashrc
bun --version
```

如果服务器使用 `zsh`：

```bash
source ~/.zshrc
```

### 3.2 安装 PM2

```bash
bun add -g pm2
pm2 --version
```

如果 `pm2` 命令找不到：

```bash
export PATH="$HOME/.bun/bin:$PATH"
```

### 3.3 拉取代码

```bash
git clone <your-repo-url> /www/wwwroot/huas-server
cd /www/wwwroot/huas-server
```

### 3.4 准备环境变量

```bash
cp .env.example .env
```

最少需要配置：

```env
PORT=3000
NODE_ENV=production
JWT_SECRET=replace-with-a-random-secret
# 蓝绿槽必须共同访问同一个持久目录
DB_PATH=/www/wwwroot/huas-server/data/huas.db
LOG_LEVEL=info
TZ=Asia/Shanghai
TIMEZONE=Asia/Shanghai
SERVER_IDLE_TIMEOUT_SECONDS=60
SCHEDULE_SOURCE_MODE=jw-first
# 默认使用 dirname(DB_PATH)/schedule-source-policy.json，无需覆盖。
# 仅在确有需要时填写 release 外的绝对共享路径：
# SCHEDULE_SOURCE_POLICY_FILE=/www/wwwroot/huas-server/data/schedule-source-policy.json
```

生成随机密钥：

```bash
openssl rand -base64 32
```

常用运行时配置：

| 变量 | 默认值 | 作用 |
|---|---|---|
| `SERVER_IDLE_TIMEOUT_SECONDS` | `60` | Bun HTTP 连接 idle timeout，单位秒。课表强刷可能超过 10 秒，生产不要使用 Bun 默认值 |
| `AUTH_LOGIN_RATE_LIMIT_MAX_FAILURES` | `20` | 同一账号登录失败限流阈值 |
| `AUTH_LOGIN_RATE_LIMIT_WINDOW_MS` | `300000` | 登录失败统计窗口 |
| `AUTH_LOGIN_RATE_LIMIT_BLOCK_MS` | `600000` | 登录失败触发限流后的封禁时长 |
| `SCHEDULE_SOURCE_MODE` | `jw-first` | 首次没有有效状态文件时的课表来源顺序；仅支持 `jw-first` / `portal-first` |
| `SCHEDULE_SOURCE_POLICY_FILE` | `dirname(DB_PATH)/schedule-source-policy.json` | 通常不要覆盖；`DB_PATH` 必须位于蓝绿槽共享持久目录，若覆盖则只能使用 release 外绝对共享路径 |

### 3.5 安装依赖并启动

```bash
mkdir -p data logs
bun install --frozen-lockfile
bun run web:build
bun run db:migrate -- --db ./data/huas.db --allow-destructive
pm2 start ecosystem.config.cjs
pm2 save
```

设置开机自启：

```bash
pm2 startup
```

执行 `pm2 startup` 输出的那一行命令后，再执行：

```bash
pm2 save
```

### 3.6 验证服务

```bash
curl http://127.0.0.1:3000/health/ready
curl -I http://127.0.0.1:3000/m
```

如果前端已经构建完成，`/m` 应返回 `200` 或 `304`。

## 4. 发布方式

### 4.1 历史快速入口（维护发布别名）

当前保留这个文件名，但它不再执行独立的 rsync + PM2 重载流程：

```bash
scripts/deploy-huas.sh
```

脚本只映射历史参数，然后 `exec` 到 `deploy-huas-zero-downtime.sh`。因此它同样会进入停流维护窗口，不是快速重载逃生口。`--dry-run` 只打印映射结果，不上传文件也不改变远端状态。

### 4.2 本地依赖

运行脚本前，本地机器需要有：

- `npm` 或 `bun`（脚本会按 `web/` 锁文件自动选择，当前会优先使用 `package-lock.json`）
- `rsync`
- `ssh`

### 4.3 基本用法

默认参数：

- `REMOTE_HOST=baidu`
- `REMOTE_DIR=/www/wwwroot/huas-server`
- `APP_NAME=huas-server`

直接部署：

```bash
REMOTE_HOST=your-server \
REMOTE_DIR=/www/wwwroot/huas-server \
APP_NAME=huas-server \
scripts/deploy-huas.sh
```

先看同步结果但不真正重启：

```bash
REMOTE_HOST=your-server scripts/deploy-huas.sh --dry-run
```

### 4.4 可用环境变量

| 变量 | 默认值 | 作用 |
|---|---|---|
| `REMOTE_HOST` | `baidu` | SSH 目标主机 |
| `REMOTE_DIR` | `/www/wwwroot/huas-server` | 远程项目目录 |
| `APP_NAME` | `huas-server` | PM2 应用名 |
| `BUILD_WEB` | `1` | 维护发布必须为 `1`；远端需构建并冒烟验证新 Web |
| `INSTALL_WEB_DEPS` | `1` | 为 `0` 时跳过本地 `web` 依赖安装 |
| `INSTALL_SERVER_DEPS` | `1` | 为 `0` 时跳过远程 `bun install --production` |
| `WEB_PACKAGE_MANAGER` | `auto` | 本地前端构建包管理器，默认按锁文件自动判断 |

### 4.5 远端 PM2 与 writer 行为

维护窗口开始后，脚本会停止 `huas-server-blue`、`huas-server-green` 和历史 `huas-server` 进程，并立即 `pm2 save`。这是 SQLite contract migration 的单 writer 门禁，不允许旧进程在快照或迁移期间继续写入。

迁移后只启动目标槽进程。`/health/ready` 与 `/m` 本机冒烟都通过后才持久化新 PM2 状态并尝试开放流量。

### 4.6 本地维护发布

如果你不通过 Git push 发布，使用：

```bash
scripts/deploy-huas-zero-downtime.sh
```

这条链路会执行：

1. 将当前代码上传到远端 release，安装依赖并构建新 `web/`
2. 将 nginx 切入 503 maintenance，确认不再把用户请求转发给应用
3. 停止 blue、green 与 legacy PM2 进程，持久化停 writer 状态
4. 对共享 `DB_PATH` 创建 SQLite 一致性快照
5. 显式执行 `db:migrate --allow-destructive`
6. 只启动目标槽新 Server，本机检查 `/health/ready`
7. 本机请求 `/m` 验证新 Web 产物能由新 Server 托管
8. 两项冒烟都通过后，才把 nginx 指向目标槽并原子更新 `active-slot`

当前服务器默认槽位：

- `blue` -> `127.0.0.1:3000`
- `green` -> `127.0.0.1:3001`

维护状态一旦成功开启，任何后续失败都会重写 maintenance 503、停止全部 writer 并保持停流。迁移可能已提交，所以不得恢复旧 upstream，不得重启旧槽应用；必须修复新 release 并 forward-fix。

`.env`、`data/`、`logs/`、`reports/` 仍位于 release 外的共享目录。

### 4.7 Git Push 发布

如果你希望通过 `git push` 同步代码，而不是直接 `rsync` 本地工作区，推荐单独启用这一条链路：

```bash
scripts/setup-huas-git-deploy.sh
```

默认行为：

- 本地新增 git remote：`baidu`
- 远程创建裸仓库：`/www/git/huas-server.git`
- 远程裸仓库默认 HEAD 指向 `main`
- 远程为裸仓库安装 `post-receive` hook
- 每次把当前 `HEAD` 推送到 `baidu` 的 `main` 时，自动把 commit 导出为候选 release
- 候选 release 准备完成后明确进入停流维护窗口
- 只在 destructive migration 与 Server/Web 本机冒烟成功后重新开放 nginx 流量

这条链路和 `scripts/deploy-huas.sh` 是并存的，互不替代；如果你以后只想走 git 发布，可以完全不再用 `rsync` 脚本。

`post-receive` hook 会显式保护这些线上内容，不会被推送覆盖或删除：

- `.env`
- `.env.*`
- `data/`
- `logs/`
- `reports/`
- `node_modules/`
- `web/node_modules/`

也就是说：

- 线上现有环境变量不会被 git 推送覆盖
- 线上数据库、图片、运行日志不会被 git 推送覆盖
- 代码会按推送的 commit 更新，但运行期数据保留在服务器

初始化完成后，标准发布命令：

```bash
git push baidu HEAD:main
```

hook 会自动执行维护发布：

1. 将推送的 `main` commit 导出为候选 release
2. 排除并保留 `.env`、`data`、`logs` 等共享内容
3. 执行停流/停 writer、snapshot 和 `db:migrate --allow-destructive`
4. 启动目标槽并执行 `/health/ready` 与 `/m` 本机冒烟
5. 冒烟通过后开放 nginx 流量；失败则继续 maintenance 并 forward-fix

如果需要自定义远程参数，可以在初始化时传环境变量：

```bash
REMOTE_HOST=baidu \
BARE_REPO_DIR=/www/git/huas-server.git \
APP_DIR=/www/wwwroot/huas-server \
APP_NAME=huas-server \
DEPLOY_BRANCH=main \
scripts/setup-huas-git-deploy.sh
```

## 5. 手动运维命令

### 5.1 PM2

维护发布仍使用 blue/green 槽保存 release，常见 PM2 进程名为：

- `huas-server-blue`
- `huas-server-green`
- 历史 `huas-server`（维护窗口会与两个槽进程一起停止）

先确认当前活动槽：

```bash
cat /www/wwwroot/huas-server/.deploy/active-slot
```

```bash
pm2 status --no-color
pm2 logs huas-server-green --lines 100
pm2 logs huas-server-blue --lines 100
pm2 monit
```

### 5.2 安装依赖

日常发布不要在服务器上手动安装依赖，直接走第 9 节的发布流程。

如果只是为了排障，先定位当前活动槽，再进入对应 release 目录：

```bash
ACTIVE_SLOT="$(cat /www/wwwroot/huas-server/.deploy/active-slot)"
cd "/www/wwwroot/huas-server/.deploy/current/$ACTIVE_SLOT"
bun install --frozen-lockfile --production
```

### 5.3 前端构建

日常发布不要在服务器上手动构建前端，直接走第 9 节的发布流程。

如果只是为了排障，先进入当前活动槽目录再构建。当前 `web/` 下存在 `package-lock.json`，建议与发布脚本保持一致，优先使用 `npm`：

```bash
ACTIVE_SLOT="$(cat /www/wwwroot/huas-server/.deploy/active-slot)"
cd "/www/wwwroot/huas-server/.deploy/current/$ACTIVE_SLOT/web"
npm ci --include=dev --registry=https://registry.npmjs.org
npm run build
```

如果后续移除了 `package-lock.json`，再改为与发布脚本自动识别出的包管理器保持一致。

## 6. 目录说明

线上部署后最关键的目录：

```txt
/www/wwwroot/huas-server
├── .deploy/
│   ├── active-slot
│   ├── current/
│   │   ├── blue -> ../releases/<release>-blue
│   │   └── green -> ../releases/<release>-green
│   ├── releases/
│   ├── logs/
│   ├── env/
│   └── ecosystem/
├── src/
├── web/
│   └── dist/
├── public/
├── data/
│   ├── discover/
│   ├── treehole-avatars/
│   ├── message-media/
│   ├── snapshots/
│   └── huas.db
├── logs/
├── ecosystem.config.cjs
└── .env
```

关键说明：

- `.deploy/active-slot` 记录当前线上流量所在槽位
- `.deploy/current/<slot>` 是当前槽位的 release 软链接
- `.deploy/releases/` 保存每次维护发布生成的槽位 release
- `.deploy/logs/<slot>/` 保存槽位级别的 PM2 日志
- `web/dist` 是 `/m` 前端入口的静态资源来源
- `public/` 只保存无需构建的开发静态资产；后台唯一入口由 `web/dist` 提供于 `/m/admin/*`
- `data/` 存数据库、Discover 图片、Community 头像、私信媒体和数据库快照
- `data/message-media/` 只保存 Messaging WebP 文件；数据库保存元数据，普通用户和管理员都必须走鉴权 API，禁止直接配置成 Nginx 静态目录
- `logs/pm2-out.log` 与 `logs/pm2-error.log` 会被管理仪表盘读取

## 7. Nginx 反向代理

如果你使用 Nginx 做反向代理，可以继续保留根目录的 `nginx.conf` 作为参考模板。

当前 `huas` 线上是宝塔 Nginx，维护发布在 maintenance 503 与目标槽之间切换的是：

- `/www/server/panel/vhost/nginx/huas-server-active-proxy.inc`

槽位与端口对应关系：

- `blue` -> `127.0.0.1:3000`
- `green` -> `127.0.0.1:3001`

最少需要保证：

- `/m`、`/api`、`/auth`、`/health`、`/metrics`、`/media/*` 都转发到 Bun 服务
- 请求体大小必须覆盖 Messaging 单条消息 64MB 原图总量及 multipart 开销；建议 `client_max_body_size` 不低于 `70m`
- HTTPS 终止在 Nginx 层

## 8. 日志与数据

日志文件：

- `logs/pm2-out.log`
- `logs/pm2-error.log`
- `logs/huas-YYYY-MM-DD.log`
- `logs/error-YYYY-MM-DD.log`

数据文件：

- `data/huas.db`
- `data/discover/`
- `data/treehole-avatars/`
- `data/message-media/`
- `data/announcements.json`

`treehole-avatars` 是历史目录名，当前所有权属于 Community；Messaging 媒体固定落在 `dirname(DB_PATH)/message-media`，没有独立环境变量可把它与 SQLite 持久目录拆开。备份与迁移数据库时必须同时保留该目录，否则消息元数据仍在但图片永久缺失。

运行期周期维护由同一 registry 管理：Activity Outbox 默认每 5 秒重试；通知第一版永久保留，不注册已读清理或归档；无主私信媒体每小时检查一次，只删除超过 1 小时且没有 `message_images` 引用的候选目录。已引用消息图片永久保留，不属于周期清理对象。

Notifications/Messaging 成功 GET 轮询采用 quiet access log，但 HTTP metrics 仍然统计；4xx/5xx 和发送、已读等写操作继续记录。任何日志都不得包含消息正文、原始文件名或图片内容。

### 8.1 Database migration

数据库结构以 `src/db/migrations/` 中不可变的编号 migration 为事实源，`0001/0002` 保持不可变，`0003_social_rearchitecture` 是明确的 contract migration。migration 记录写入 `huas_schema_migrations`，每个版本在单独的 SQLite immediate transaction 中执行；单个版本失败时该版本的 DDL/DML 与版本记录一起回滚。

对空库初始化：

```bash
bun run db:migrate -- --db ./data/huas.db --allow-destructive
```

对已有库首次采用 baseline 时，执行器会比较表与索引的结构化 fingerprint。只有与 baseline 完全一致才写 adoption 记录；缺表、多表、列或索引定义漂移都会拒绝继续，并输出对象差异与诊断命令。不要通过手写 migration 记录绕过检查。

执行器默认拒绝破坏性 migration；维护发布必须在停流、停 writer 和快照成功后显式传入 `--allow-destructive`。这只是执行授权，不是回滚能力；应用启动只校验 schema version，不再自动改变结构。

`0003_social_rearchitecture` 在同一事务中动态保存并复核 users、credentials、cache、Discover 和 Treehole 八张核心事实表的行数，并把旧昵称/头像元数据迁入 `community_profiles`。按产品废弃决策，旧 Discover 评分表/字段和旧 Treehole 通知表即使非空也直接删除，不转换成点赞或新通知；核心事实守恒与最终结构断言仍会在不一致时完整回滚。运维人员不得通过手写版本记录或修改 migration 绕过断言。

### 8.2 派生计数 repair

先执行无写入检查：

```bash
bun run db:repair -- --db ./data/huas.db --dry-run
```

确认影响行数后执行修复：

```bash
bun run db:repair -- --db ./data/huas.db
```

repair 在事务内重新计算 Discover 的点赞数、未删除评论数，以及 Treehole 的点赞数、未删除评论数。它只更新不一致的帖子，可重复执行；第二次执行应报告 `0`。输出只包含影响行数，不输出数据库行内容。

### 8.3 部署前 SQLite snapshot

手动快照必须提供明确数据库路径与 release 标识：

```bash
bun run db:snapshot -- \
  --db ./data/huas.db \
  --output-dir ./data/snapshots \
  --release manual-before-maintenance
```

命令先执行 `PRAGMA quick_check`，再使用 SQLite 官方 `VACUUM INTO` 创建一致性副本。文件名格式为：

```text
huas-<UTC时间>-schema-v<版本>-release-<标识>.db
```

`db:snapshot` 只复制 SQLite，不复制 `message-media`。停 writer 后的完整灾备必须另行复制整个明确的 `dirname(DB_PATH)/message-media` 目录，并把它与同一 release 的数据库快照成对标记；不要在仍有上传事务运行时单独复制媒体目录。

普通应用启动不会自动快照或迁移。维护发布严格按“maintenance 503 → stop writers → snapshot → `db:migrate --allow-destructive` → Server/Web 本机冒烟 → 开放流量”执行。首次部署若数据库尚不存在，也必须在应用启动前显式执行迁移。

### 8.4 快照保留与恢复

`data/snapshots/` 可能包含人工快照或其他工具产生的文件，发布脚本不会自动清理。运维人员只能按明确文件名、创建时间、release 和 schema version 制定保留策略；禁止用未知 glob 自动删除未识别文件。

快照恢复只属于单独批准的事故恢复，不是发布脚本的自动失败分支。若确需恢复，先保持 nginx maintenance 并停止所有访问 SQLite 的进程，明确评估快照后生产写入丢失窗口，再把目标快照复制到新路径、执行 `PRAGMA quick_check` 并原子切换明确的 `DB_PATH`。

备份时至少保留：

- `data/`
- `.env`

### 8.5 临时库迁移与启动演练

发布前先运行自动化 v2 样本演练。该套件只使用内存或系统临时目录，覆盖 destructive flag、核心数据守恒、schema mismatch 启动拒绝、迁移事务回滚、`quick_check` 与外键检查：

```bash
bun test tests/database-migrations.test.ts
```

还可用一个全新的临时文件库验证 CLI、运行期只读 schema 门禁与 readiness。以下命令绝不指向 `data/huas.db`：

```bash
REHEARSAL_ROOT="$(mktemp -d)"
REHEARSAL_DB="$REHEARSAL_ROOT/social-v3.db"
REHEARSAL_PORT=31999

bun run db:migrate -- --db "$REHEARSAL_DB" --allow-destructive

DB_PATH="$REHEARSAL_DB" \
PORT="$REHEARSAL_PORT" \
NODE_ENV=production \
bun run src/index.ts >"$REHEARSAL_ROOT/server.log" 2>&1 &
REHEARSAL_PID=$!

curl --fail "http://127.0.0.1:$REHEARSAL_PORT/health/ready"
kill "$REHEARSAL_PID"
wait "$REHEARSAL_PID" || true
```

若环境禁止监听本地端口，至少执行迁移测试、`bun run db:verify`，并以临时库调用 `assertDatabaseSchemaCurrent`；这不能替代真实发布窗口中的 Server/Web 本机冒烟。

若进程在监听前退出，优先检查 DB 文件是否存在、migration 版本是否落后、name/checksum 是否被改写以及最终 schema fingerprint 是否漂移。`/health/ready` 只报告已经启动进程的本地 readiness，不执行也不修复 migration。

任何候选数据库在开放流量前还必须满足：

```sql
PRAGMA quick_check;       -- 唯一结果必须是 ok
PRAGMA foreign_key_check; -- 必须返回空结果
```

演练完成后只删除已经确认的 `REHEARSAL_ROOT`，禁止使用未解析变量或宽泛 glob 清理数据目录。

## 9. 更新流程

### 9.1 以后默认就按这个流程发版（推荐）

当前 `huas` 服务器已经完成 `baidu` remote 和 `post-receive` hook 初始化。

预约维护窗口后，在本地执行：

```bash
git status
git add <你要发布的文件>
git commit -m "发布说明"
git push baidu HEAD:main
```

如果你当前不在 `main`，但要把当前分支头发布到线上：

```bash
git push baidu HEAD:main
```

标准发布结果应该是：

1. 代码被推送到服务器裸仓库
2. `post-receive` hook 将 commit 导出为候选 release，先安装依赖并构建 Web
3. nginx 进入 maintenance 503，全部 PM2 writer 停止并持久化状态
4. 快照成功后执行 `db:migrate --allow-destructive`
5. 新 Server `/health/ready` 和 Web `/m` 本机冒烟通过后，nginx 才重新开放流量

发布完成后，建议立刻验证：

```bash
ssh baidu 'cat /www/wwwroot/huas-server/.deploy/active-slot && pm2 status --no-color'
curl https://api.huas-api.top/health/ready
```

这条链路的几个固定规则：

- 只有已经 `commit` 的内容会上线
- `.env`、`data/`、`logs/`、`reports/` 不会被发布覆盖
- 维护状态开启后发布失败，必须保持停流与停 writer，不得恢复旧 upstream
- 失败后修复候选 release 并 forward-fix，不得把旧 commit 当作自动回滚
- 不要在服务器的 `/www/wwwroot/huas-server` 里执行 `git pull`
- 不要手动删除 `.deploy/active-slot`、`.deploy/current/blue`、`.deploy/current/green`

### 9.2 首次初始化或重建服务器时

只有在以下情况，才需要重新执行初始化：

- 重装了 `huas` 服务器
- 删除了远端裸仓库 `/www/git/huas-server.git`
- 想重新生成 `baidu` remote 或 `post-receive` hook

初始化命令：

```bash
scripts/setup-huas-git-deploy.sh
```

如果需要自定义远程参数：

```bash
REMOTE_HOST=baidu \
BARE_REPO_DIR=/www/git/huas-server.git \
APP_DIR=/www/wwwroot/huas-server \
APP_NAME=huas-server \
DEPLOY_BRANCH=main \
scripts/setup-huas-git-deploy.sh
```

### 9.3 备用流程：本地维护发布脚本

如果你暂时不想走 `git push`，也可以在本地直接执行：

```bash
scripts/deploy-huas-zero-downtime.sh
```

这条链路与 Git hook 执行同一停流、停 writer、快照、destructive migration 和本机冒烟流程。

### 9.4 历史快速文件名

在本地执行：

```bash
REMOTE_HOST=your-server \
REMOTE_DIR=/www/wwwroot/huas-server \
APP_NAME=huas-server \
scripts/deploy-huas.sh
```

该文件仅是维护发布别名，执行语义与 9.3 完全相同。

### 9.5 migration 后失败处置：forward-fix

维护状态开启后，脚本不会自动恢复旧 upstream。尤其在 migration 命令已开始后，无法根据调用方看到的失败位置推断数据库仍兼容旧应用。

固定处置顺序：

1. 保持 nginx maintenance 503，保持全部 PM2 writer stopped；
2. 保存脚本输出、目标槽日志、快照文件名和 migration version；
3. 在候选 release 上修复问题，用同一维护发布重跑；
4. 只在新 Server `/health/ready` 和 Web `/m` 本机冒烟均通过后重新开放流量。

不得通过强推旧 commit、重启旧槽或手工改回 nginx upstream 绕过这个门禁。快照恢复是另一个需明确批准、接受数据丢失窗口的事故恢复流程。

### 9.6 服务器手动更新

不再维护 `git pull + pm2 restart` 这种可绕过停 writer、快照和 destructive migration 授权的发布方式。即使服务器目录本身是 git clone，也应将要发布的 commit 从本地推送到 `baidu/main`，由维护发布内核执行完整门禁。

## 10. 故障排查

### 10.1 PM2 启动失败

```bash
cat /www/wwwroot/huas-server/.deploy/active-slot
pm2 status --no-color
pm2 logs huas-server-green --lines 100
pm2 logs huas-server-blue --lines 100
```

重点检查：

- `.env` 是否存在
- `JWT_SECRET` 是否已配置
- `bun` 与 `pm2` 是否在 PATH 中

### 10.2 `/m` 前端打不开

先看构建产物：

```bash
ACTIVE_SLOT="$(cat /www/wwwroot/huas-server/.deploy/active-slot)"
ls -la "/www/wwwroot/huas-server/.deploy/current/$ACTIVE_SLOT/web/dist"
```

如果 `index.html` 不存在，重新构建：

```bash
ACTIVE_SLOT="$(cat /www/wwwroot/huas-server/.deploy/active-slot)"
cd "/www/wwwroot/huas-server/.deploy/current/$ACTIVE_SLOT/web"
npm ci --include=dev --registry=https://registry.npmjs.org
npm run build
```

### 10.3 `scripts/deploy-huas.sh` 失败

优先检查：

- 本地是否安装了 `bun`、`rsync`、`ssh`
- 远程是否安装了 `bun`、`pm2`、`curl`
- 远程 `REMOTE_DIR` 是否存在并可写
- 远程 `.env` 是否已准备好，且包含合法的 `PORT`

### 10.4 `git push baidu` 失败

优先检查：

- 本地是否已经执行过 `scripts/setup-huas-git-deploy.sh`
- 本地 `git remote get-url baidu` 是否指向正确的 SSH 地址
- 远程 `/www/git/huas-server.git/hooks/post-receive` 是否存在且可执行
- 远程是否安装了 `git`、`rsync`、`bun`、`npm`、`pm2`、`curl`
- 远程 `/www/wwwroot/huas-server/.env` 是否存在，且包含合法的 `PORT`

先做 push dry-run：

```bash
git push --dry-run baidu HEAD:main
```

### 10.5 `/api/*` 偶发 502

先确认服务本身是否还活着：

```bash
ACTIVE_SLOT="$(cat /www/wwwroot/huas-server/.deploy/active-slot)"
PORT="$(grep -E '^PORT=' /www/wwwroot/huas-server/.env | cut -d= -f2)"
curl -i "http://127.0.0.1:$PORT/health/ready"
pm2 status --no-color
pm2 logs "huas-server-$ACTIVE_SLOT" --lines 100
tail -n 100 /www/wwwlogs/api.huas-api.top.error.log
```

如果 nginx error log 里出现 `upstream prematurely closed connection`，同时应用日志里对应请求耗时接近 10 秒，通常是 Bun 默认 idle timeout 先关闭了仍在处理中的 HTTP 连接。

修复方式：

1. 确认线上 `.env` 包含 `SERVER_IDLE_TIMEOUT_SECONDS=60`
2. 重新发布或执行 `pm2 restart <app> --update-env`
3. 再用慢路径接口验证，例如课表 `refresh=true`

### 10.6 课表强刷返回旧缓存

现象：

- 客户端收到 `200`，但 `_meta.stale=true`、`_meta.refresh_failed=true`
- `_meta.last_error` 常见为 `3004` 或 `5000`
- 日志出现 `RefreshFallback ... 回退缓存`

排查方向：

- `3004` 多数是学校上游超时
- `3003` 表示凭证过期且自动恢复失败，需要重新登录；课表接口不会再用旧缓存掩盖该错误
- 如果 JW 返回的是 HTTP 200 登录页，页面里包含 `您的账号在其它地方登录`、`/jsxsd/xk/LoginToXk`、`用户登录`、`验证码` 等特征，表示该账号的 JW 会话被其他登录挤掉

当前实现会把这类 JW 登录页判定为 `SESSION_EXPIRED`，触发凭证恢复并重试。若双源凭证恢复最终失败，课表接口直接要求用户重新登录，不返回 stale 成功态。

### 10.7 热切换课表来源顺序

先建立后台 Cookie 会话，再读取或修改策略：

```bash
curl -sS -c /tmp/huas-admin-cookie \
  -H 'Content-Type: application/json' \
  -d '{"username":"<admin>","password":"<password>"}' \
  http://127.0.0.1:3000/api/admin/session

curl -sS -b /tmp/huas-admin-cookie \
  http://127.0.0.1:3000/api/admin/academic/schedule-source-policy

curl -sS -b /tmp/huas-admin-cookie \
  -X PUT -H 'Content-Type: application/json' \
  -d '{"mode":"portal-first"}' \
  http://127.0.0.1:3000/api/admin/academic/schedule-source-policy
```

切换只影响随后开始的 `/api/schedule` 请求，不清缓存、不触发校园上游请求。已执行中的请求继续使用启动时快照；响应 `_meta.policy_mode` 可用于核对。

运维检查：

1. 确认 PUT 后 GET 返回目标 `mode`、更新时间与操作人。
2. 确认 `DB_PATH` 位于蓝绿槽共享持久目录；策略默认跟随其目录。若覆盖 `SCHEDULE_SOURCE_POLICY_FILE`，必须使用 release 外绝对共享路径。
3. 查看 OPS 审计日志中的旧模式与新模式。
4. 状态 JSON 损坏时服务保留最后有效快照并告警；修复文件或再次 PUT 后恢复跨进程传播。
5. 不要手工删除缓存验证顺序；用独立测试账号发 `refresh=true`，观察 `_meta.primary_source/source/fallback`。

## 11. 当前约束

当前维护结论：

- 只保留 PM2 运行方式
- 默认发布方式是 `git push baidu HEAD:main`
- 本地维护发布脚本是 `scripts/deploy-huas-zero-downtime.sh`，文件名不代表零停机承诺
- `scripts/deploy-huas.sh` 仅作为同一维护发布的历史别名保留
- maintenance 开启后任一失败都保持 503 与停 writer，只允许 forward-fix
- 不再维护 Docker 和根目录 `deploy.sh`
