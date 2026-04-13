# HUAS Server 部署与运维手册

本文档只保留当前维护中的部署链路：

- 运行方式：`Bun + PM2`
- 发布脚本：`scripts/deploy-huas.sh`

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

当前只维护三种操作：

1. 服务器上使用 PM2 直接运行服务
2. 本地通过 `scripts/deploy-huas.sh` 构建前端、同步代码并远程重启 PM2
3. 本地通过 `git push huas-deploy master` 推送到服务器裸仓库，由 `post-receive` hook 同步代码、构建并重载 PM2

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
```

生成随机密钥：

```bash
openssl rand -base64 32
```

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

## 4. 标准发布方式

当前标准发布入口：

```bash
scripts/deploy-huas.sh
```

脚本会执行以下动作：

1. 在本地构建 `web/`
2. 用 `rsync` 同步项目到远程目录
3. 在远程执行 `bun install --frozen-lockfile --production`
4. 用 PM2 `startOrReload` 重载应用并执行本机健康检查

### 4.1 本地依赖

运行脚本前，本地机器需要有：

- `npm` 或 `bun`（脚本会按 `web/` 锁文件自动选择，当前会优先使用 `package-lock.json`）
- `rsync`
- `ssh`

### 4.2 基本用法

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

### 4.3 可用环境变量

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

### 4.4 远程 PM2 行为

脚本的远程逻辑已经统一：

- 要求远程 `.env` 存在，并从中读取 `PORT`
- 使用 `pm2 startOrReload ecosystem.config.cjs --only <APP_NAME> --update-env`
- 成功后执行 `pm2 save`
- 最后检查 `http://127.0.0.1:$PORT/health`

这意味着：

- 首次部署也可以直接使用同一个脚本
- 后续发布无需额外的根目录部署脚本
- `SYNC_DELETE=1` 也不会再清掉 `.env`、`data`、`logs`

### 4.5 Git Push 发布

如果你希望通过 `git push` 同步代码，而不是直接 `rsync` 本地工作区，推荐单独启用这一条链路：

```bash
scripts/setup-huas-git-deploy.sh
```

默认行为：

- 本地新增 git remote：`huas-deploy`
- 远程创建裸仓库：`/www/git/huas-server.git`
- 远程为裸仓库安装 `post-receive` hook
- 每次推送 `master` 到 `huas-deploy` 时，自动把 commit 导出并同步到 `/www/wwwroot/huas-server`

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
git push huas-deploy master
```

hook 会自动执行：

1. 将推送的 `master` commit 导出到临时目录
2. 用 `rsync --delete` 同步代码到 `/www/wwwroot/huas-server`
3. 排除并保留 `.env`、`data`、`logs` 等运行期内容
4. 在远程执行 `bun install --frozen-lockfile --production`
5. 在远程执行 `web/` 的依赖安装和构建
6. 用 PM2 `startOrReload` 重载应用并执行本机健康检查

如果需要自定义远程参数，可以在初始化时传环境变量：

```bash
REMOTE_HOST=huas \
BARE_REPO_DIR=/www/git/huas-server.git \
APP_DIR=/www/wwwroot/huas-server \
APP_NAME=huas-server \
DEPLOY_BRANCH=master \
scripts/setup-huas-git-deploy.sh
```

## 5. 手动运维命令

### 5.1 PM2

```bash
pm2 status
pm2 logs huas-server
pm2 restart huas-server
pm2 stop huas-server
pm2 delete huas-server
pm2 monit
```

### 5.2 安装依赖

```bash
cd /www/wwwroot/huas-server
bun install --frozen-lockfile --production
```

### 5.3 前端构建

当前 `web/` 下存在 `package-lock.json`，手动构建时建议与发布脚本保持一致，优先使用 `npm`：

```bash
cd /www/wwwroot/huas-server/web
npm ci --include=dev
npm run build
```

如果后续移除了 `package-lock.json`，再改为与 `scripts/deploy-huas.sh` 自动识别出的包管理器保持一致。

## 6. 目录说明

线上部署后最关键的目录：

```txt
/www/wwwroot/huas-server
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

- `web/dist` 是 `/m` 前端入口的静态资源来源
- `public/status.html` 是 `/status` 页面来源
- `data/` 存数据库、Discover 图片和 Treehole 头像
- `logs/pm2-out.log` 与 `logs/pm2-error.log` 会被管理仪表盘读取

## 7. Nginx 反向代理

如果你使用 Nginx 做反向代理，可以继续保留根目录的 `nginx.conf` 作为参考模板。

典型反代目标：

- `127.0.0.1:3000`

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

### 9.1 推荐流程（rsync）

在本地执行：

```bash
REMOTE_HOST=your-server \
REMOTE_DIR=/www/wwwroot/huas-server \
APP_NAME=huas-server \
scripts/deploy-huas.sh
```

### 9.2 推荐流程（git push）

先初始化一次：

```bash
scripts/setup-huas-git-deploy.sh
```

之后每次发布：

```bash
git push huas-deploy master
```

如果你本地分支不是 `master`，但要发布当前 HEAD：

```bash
git push huas-deploy HEAD:master
```

### 9.3 服务器手动更新

只有在服务器目录本身就是 git clone 时，才适用这一组命令。

如果当前服务器目录是通过 `rsync` 或 `git push -> post-receive hook` 维护的工作目录，那么它通常不是 git 仓库，不能直接在 `/www/wwwroot/huas-server` 里执行 `git pull`。

满足“服务器目录本身就是 git clone”这个前提时，可以手动：

```bash
cd /www/wwwroot/huas-server
git fetch origin
git checkout master
git pull --ff-only origin master
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
pm2 logs huas-server --lines 100
```

重点检查：

- `.env` 是否存在
- `JWT_SECRET` 是否已配置
- `bun` 与 `pm2` 是否在 PATH 中

### 10.2 `/m` 前端打不开

先看构建产物：

```bash
ls -la /www/wwwroot/huas-server/web/dist
```

如果 `index.html` 不存在，重新构建：

```bash
cd /www/wwwroot/huas-server/web
bun install --frozen-lockfile
bun run build
```

### 10.3 `scripts/deploy-huas.sh` 失败

优先检查：

- 本地是否安装了 `bun`、`rsync`、`ssh`
- 远程是否安装了 `bun`、`pm2`、`curl`
- 远程 `REMOTE_DIR` 是否存在并可写
- 远程 `.env` 是否已准备好，且包含合法的 `PORT`

### 10.4 `git push huas-deploy` 失败

优先检查：

- 本地是否已经执行过 `scripts/setup-huas-git-deploy.sh`
- 本地 `git remote get-url huas-deploy` 是否指向正确的 SSH 地址
- 远程 `/www/git/huas-server.git/hooks/post-receive` 是否存在且可执行
- 远程是否安装了 `git`、`rsync`、`bun`、`npm`、`pm2`、`curl`
- 远程 `/www/wwwroot/huas-server/.env` 是否存在，且包含合法的 `PORT`

先做 dry-run：

```bash
REMOTE_HOST=your-server scripts/deploy-huas.sh --dry-run
```

## 11. 当前约束

当前维护结论：

- 只保留 PM2 运行方式
- 只保留 `scripts/deploy-huas.sh` 作为仓库内维护中的部署脚本
- 不再维护 Docker 和根目录 `deploy.sh`
