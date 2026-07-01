# HUAS Server 部署与运维手册

本文档当前维护中的部署链路：

- 运行方式：`Bun + PM2`
- 快速发布：`scripts/deploy-huas.sh`
- 无痛蓝绿发布：`scripts/deploy-huas-zero-downtime.sh`
- Git Push 蓝绿发布：`git push baidu HEAD:main`

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
2. 本地通过 `scripts/deploy-huas.sh` 构建前端、同步代码并远程重启 PM2
3. 本地通过 `scripts/deploy-huas-zero-downtime.sh` 执行蓝绿发布，在健康检查通过后再切 nginx 流量
4. 本地通过 `git push baidu HEAD:main` 推送到服务器裸仓库，由 `post-receive` hook 执行蓝绿发布

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
DB_PATH=./data/huas.db
LOG_LEVEL=info
TZ=Asia/Shanghai
TIMEZONE=Asia/Shanghai
SERVER_IDLE_TIMEOUT_SECONDS=60
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

### 3.5 安装依赖并启动

```bash
mkdir -p data logs
bun install --frozen-lockfile
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
curl http://127.0.0.1:3000/health
curl -I http://127.0.0.1:3000/m
```

如果前端已经构建完成，`/m` 应返回 `200` 或 `304`。

## 4. 发布方式

### 4.1 快速发布（可能有短暂切换）

当前快速发布入口：

```bash
scripts/deploy-huas.sh
```

脚本会执行以下动作：

1. 在本地构建 `web/`
2. 用 `rsync` 同步项目到远程目录
3. 在远程执行 `bun install --frozen-lockfile --production`
4. 用 PM2 `startOrReload` 重载应用并执行本机健康检查

### 4.2 本地依赖

运行脚本前，本地机器需要有：

- `npm` 或 `bun`（脚本会按 `web/` 锁文件自动选择，当前会优先使用 `package-lock.json`）
- `rsync`
- `ssh`

### 4.3 基本用法

默认参数：

- `REMOTE_HOST=huas`
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
| `REMOTE_HOST` | `huas` | SSH 目标主机 |
| `REMOTE_DIR` | `/www/wwwroot/huas-server` | 远程项目目录 |
| `APP_NAME` | `huas-server` | PM2 应用名 |
| `SYNC_DELETE` | `0` | 为 `1` 时启用 `rsync --delete`，仅清理代码残留，不删除 `.env`、`data`、`logs` |
| `BUILD_WEB` | `1` | 为 `0` 时跳过本地前端构建 |
| `INSTALL_WEB_DEPS` | `1` | 为 `0` 时跳过本地 `web` 依赖安装 |
| `INSTALL_SERVER_DEPS` | `1` | 为 `0` 时跳过远程 `bun install --production` |
| `WEB_PACKAGE_MANAGER` | `auto` | 本地前端构建包管理器，默认按锁文件自动判断 |

### 4.5 远程 PM2 行为

脚本的远程逻辑已经统一：

- 要求远程 `.env` 存在，并从中读取 `PORT`
- 使用 `pm2 startOrReload ecosystem.config.cjs --only <APP_NAME> --update-env`
- 成功后执行 `pm2 save`
- 最后检查 `http://127.0.0.1:$PORT/health`

这意味着：

- 首次部署也可以直接使用同一个脚本
- 后续发布无需额外的根目录部署脚本
- `SYNC_DELETE=1` 也不会再清掉 `.env`、`data`、`logs`

### 4.6 无痛蓝绿发布

如果你要尽量避免影响用户体验，优先使用：

```bash
scripts/deploy-huas-zero-downtime.sh
```

这条链路会执行：

1. 将当前代码上传到远端非活动槽
2. 在非活动槽安装依赖并构建 `web/`
3. 用 PM2 在备用端口启动新实例
4. 对备用端口执行 `/health` 检查
5. 仅在健康检查通过后更新 nginx upstream 并 reload nginx

当前服务器默认槽位：

- `blue` -> `127.0.0.1:3000`
- `green` -> `127.0.0.1:3001`

首次从单实例迁移到蓝绿时：

- 旧的 `huas-server` 仍保留在 `3000`
- 新版本会先启动到 `3001`
- nginx 切到 `3001` 后，旧实例不再接收新流量

这意味着：

- 切流前用户仍然访问旧实例
- 只有新实例健康检查通过，才会切到新版本
- `.env`、`data/`、`logs/`、`reports/` 都继续保留在共享目录

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
- 每次把当前 `HEAD` 推送到 `baidu` 的 `main` 时，自动把 commit 导出到非活动槽
- 在非活动槽完成依赖安装、前端构建、健康检查
- 通过后再切 nginx 流量到新槽位

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

hook 会自动执行蓝绿发布：

1. 将推送的 `main` commit 导出到非活动槽
2. 排除并保留 `.env`、`data`、`logs` 等共享内容
3. 在非活动槽执行依赖安装和 `web` 构建
4. 启动备用端口实例并执行 `/health`
5. 健康检查通过后切 nginx 到新槽位

如果需要自定义远程参数，可以在初始化时传环境变量：

```bash
REMOTE_HOST=huas \
BARE_REPO_DIR=/www/git/huas-server.git \
APP_DIR=/www/wwwroot/huas-server \
APP_NAME=huas-server \
DEPLOY_BRANCH=main \
scripts/setup-huas-git-deploy.sh
```

## 5. 手动运维命令

### 5.1 PM2

蓝绿发布上线后，常见 PM2 进程名会变成：

- `huas-server-blue`
- `huas-server-green`
- 首次迁移后的过渡阶段，可能还会暂时看到旧的 `huas-server`，但它不再承接流量

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
│   └── treehole-avatars/
├── logs/
├── ecosystem.config.cjs
└── .env
```

关键说明：

- `.deploy/active-slot` 记录当前线上流量所在槽位
- `.deploy/current/<slot>` 是当前槽位的 release 软链接
- `.deploy/releases/` 保存每次蓝绿发布生成的 release
- `.deploy/logs/<slot>/` 保存槽位级别的 PM2 日志
- `web/dist` 是 `/m` 前端入口的静态资源来源
- `public/status.html` 是 `/status` 页面来源
- `data/` 存数据库、Discover 图片和 Treehole 头像
- `logs/pm2-out.log` 与 `logs/pm2-error.log` 会被管理仪表盘读取

## 7. Nginx 反向代理

如果你使用 Nginx 做反向代理，可以继续保留根目录的 `nginx.conf` 作为参考模板。

当前 `huas` 线上是宝塔 Nginx，蓝绿发布实际切换的是：

- `/www/server/panel/vhost/nginx/huas-server-active-proxy.inc`

槽位与端口对应关系：

- `blue` -> `127.0.0.1:3000`
- `green` -> `127.0.0.1:3001`

最少需要保证：

- `/m`、`/api`、`/auth`、`/health`、`/status`、`/media/*` 都转发到 Bun 服务
- 请求体大小足够覆盖 Discover 多图上传
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
- `data/announcements.json`

备份时至少保留：

- `data/`
- `.env`

## 9. 更新流程

### 9.1 以后默认就按这个流程发版（推荐）

当前 `huas` 服务器已经完成 `baidu` remote 和 `post-receive` hook 初始化。

以后日常无痛发布，直接在本地执行：

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
2. `post-receive` hook 将 commit 导出到非活动槽
3. 在非活动槽安装依赖、构建前端、启动新实例
4. `/health` 检查通过后，nginx 才切到新槽位
5. 老槽位继续保留，作为下一次切换前的回退缓冲

发布完成后，建议立刻验证：

```bash
ssh huas 'cat /www/wwwroot/huas-server/.deploy/active-slot && pm2 status --no-color'
curl https://api.huas-api.top/health
```

这条链路的几个固定规则：

- 只有已经 `commit` 的内容会上线
- `.env`、`data/`、`logs/`、`reports/` 不会被发布覆盖
- 发布失败时，流量会继续停留在旧槽位
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
REMOTE_HOST=huas \
BARE_REPO_DIR=/www/git/huas-server.git \
APP_DIR=/www/wwwroot/huas-server \
APP_NAME=huas-server \
DEPLOY_BRANCH=main \
scripts/setup-huas-git-deploy.sh
```

### 9.3 备用流程：本地无痛蓝绿发布脚本

如果你暂时不想走 `git push`，也可以在本地直接执行：

```bash
scripts/deploy-huas-zero-downtime.sh
```

这条链路同样会部署到非活动槽，并在健康检查通过后再切流量。

### 9.4 快速流程：允许短暂切换

在本地执行：

```bash
REMOTE_HOST=your-server \
REMOTE_DIR=/www/wwwroot/huas-server \
APP_NAME=huas-server \
scripts/deploy-huas.sh
```

这条链路仍然可用，但它不是无痛发布。只有在你接受短暂切换窗口时再使用。

### 9.5 回滚到上一个稳定版本

如果新版本已经切流，但你确认需要快速回退，可以把上一个稳定 commit 重新推到 `main`：

```bash
git log --oneline
git push --force baidu <stable_commit_sha>:main
```

回滚后同样要做一次验证：

```bash
ssh huas 'cat /www/wwwroot/huas-server/.deploy/active-slot && pm2 status --no-color'
curl https://api.huas-api.top/health
```

### 9.6 服务器手动更新（仅限 git clone 场景）

只有在服务器目录本身就是 git clone 时，才适用这一组命令。

如果当前服务器目录是通过 `rsync` 或 `git push -> post-receive hook` 维护的工作目录，那么它通常不是 git 仓库，不能直接在 `/www/wwwroot/huas-server` 里执行 `git pull`。

满足“服务器目录本身就是 git clone”这个前提时，可以手动：

```bash
cd /www/wwwroot/huas-server
git fetch github
git checkout main
git pull --ff-only github main
bun install --frozen-lockfile --production
cd web
npm ci --include=dev
npm run build
cd ..
pm2 restart huas-server
pm2 save
```

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
curl -i "http://127.0.0.1:$PORT/health"
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
- `_meta.last_error` 常见为 `3003`、`3004` 或 `5000`
- 日志出现 `RefreshFallback ... 回退缓存`

排查方向：

- `3004` 多数是学校上游超时
- `3003` 表示凭证过期且自动恢复失败，需要重新登录
- 如果 JW 返回的是 HTTP 200 登录页，页面里包含 `您的账号在其它地方登录`、`/jsxsd/xk/LoginToXk`、`用户登录`、`验证码` 等特征，表示该账号的 JW 会话被其他登录挤掉

当前实现会把这类 JW 登录页判定为 `SESSION_EXPIRED`，触发凭证恢复并重试。若同一账号持续在其他地方登录，JW 会话仍可能被反复挤掉，最终只能返回旧缓存或要求用户重新登录。

## 11. 当前约束

当前维护结论：

- 只保留 PM2 运行方式
- 默认发布方式是 `git push baidu HEAD:main`
- 无痛本地发布脚本是 `scripts/deploy-huas-zero-downtime.sh`
- `scripts/deploy-huas.sh` 仅作为快速发布入口保留
- 不再维护 Docker 和根目录 `deploy.sh`
