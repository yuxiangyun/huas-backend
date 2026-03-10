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

当前只维护两种操作：

1. 服务器上使用 PM2 直接运行服务
2. 本地通过 `scripts/deploy-huas.sh` 构建前端、同步代码并远程重启 PM2

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
4. 用 PM2 启动或重启应用

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
| `SYNC_DELETE` | `0` | 为 `1` 时启用 `rsync --delete` |
| `BUILD_WEB` | `1` | 为 `0` 时跳过本地前端构建 |
| `INSTALL_WEB_DEPS` | `1` | 为 `0` 时跳过本地 `web` 依赖安装 |
| `INSTALL_SERVER_DEPS` | `1` | 为 `0` 时跳过远程 `bun install --production` |
| `WEB_PACKAGE_MANAGER` | `auto` | 本地前端构建包管理器，默认按锁文件自动判断 |

### 4.4 远程 PM2 行为

脚本的远程逻辑已经统一：

- 如果应用已存在：`pm2 restart <APP_NAME>`
- 如果应用不存在：`pm2 start ecosystem.config.cjs --only <APP_NAME>`
- 成功后执行 `pm2 save`

这意味着：

- 首次部署也可以直接使用同一个脚本
- 后续发布无需额外的根目录部署脚本

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

```bash
cd /www/wwwroot/huas-server/web
bun install --frozen-lockfile
bun run build
```

## 6. 目录说明

线上部署后最关键的目录：

```txt
/www/wwwroot/huas-server
├── src/
├── web/
│   └── dist/
├── public/
├── data/
├── logs/
├── ecosystem.config.cjs
└── .env
```

关键说明：

- `web/dist` 是 `/m` 前端入口的静态资源来源
- `public/status.html` 是 `/status` 页面来源
- `data/` 存数据库和 Discover 图片
- `logs/pm2-out.log` 与 `logs/pm2-error.log` 会被管理仪表盘读取

## 7. Nginx 反向代理

如果你使用 Nginx 做反向代理，可以继续保留根目录的 `nginx.conf` 作为参考模板。

典型反代目标：

- `127.0.0.1:3000`

最少需要保证：

- `/m`、`/api`、`/auth`、`/health` 都转发到 Bun 服务
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
- `data/announcements.json`

备份时至少保留：

- `data/`
- `.env`

## 9. 更新流程

### 9.1 推荐流程

在本地执行：

```bash
REMOTE_HOST=your-server \
REMOTE_DIR=/www/wwwroot/huas-server \
APP_NAME=huas-server \
scripts/deploy-huas.sh
```

### 9.2 服务器手动更新

如果不走脚本，也可以手动：

```bash
cd /www/wwwroot/huas-server
git pull
bun install --frozen-lockfile --production
cd web
bun install --frozen-lockfile
bun run build
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
- 远程是否安装了 `bun`、`pm2`
- 远程 `REMOTE_DIR` 是否存在并可写
- 远程 `.env` 是否已准备好

先做 dry-run：

```bash
REMOTE_HOST=your-server scripts/deploy-huas.sh --dry-run
```

## 11. 当前约束

当前维护结论：

- 只保留 PM2 运行方式
- 只保留 `scripts/deploy-huas.sh` 作为仓库内维护中的部署脚本
- 不再维护 Docker 和根目录 `deploy.sh`
