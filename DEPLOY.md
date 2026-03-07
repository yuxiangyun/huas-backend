# HUAS Server 部署与运维手册

本文档面向零基础用户，手把手指导你把 HUAS Server 部署到 Linux 服务器上并维持稳定运行。

---

## 目录

1. [服务器要求](#1-服务器要求)
2. [准备工作](#2-准备工作)
3. [方式一：裸机部署（Bun + PM2）](#3-方式一裸机部署bun--pm2)
4. [方式二：Docker 部署](#4-方式二docker-部署)
5. [方式三：Docker Compose 部署（推荐）](#5-方式三docker-compose-部署推荐)
6. [配置 Nginx 反向代理](#6-配置-nginx-反向代理)
7. [配置 HTTPS（SSL 证书）](#7-配置-httpsssl-证书)
8. [环境变量说明](#8-环境变量说明)
9. [日常运维](#9-日常运维)
10. [日志管理](#10-日志管理)
11. [数据库管理](#11-数据库管理)
12. [更新升级](#12-更新升级)
13. [故障排查](#13-故障排查)
14. [安全建议](#14-安全建议)

---

## 1. 服务器要求

| 项目 | 最低配置 | 推荐配置 |
|------|---------|---------|
| CPU | 1 核 | 2 核 |
| 内存 | 512 MB | 1 GB |
| 硬盘 | 5 GB | 10 GB |
| 系统 | Ubuntu 20.04+ / Debian 11+ / CentOS 8+ | Ubuntu 22.04 LTS |
| 网络 | 能访问学校 CAS 系统 | 校园网内或有校园网出口 |

> **重要**：服务器必须能访问 `cas.huas.edu.cn` 和 `portal.huas.edu.cn`，如果服务器不在校园网内，需要确认能否通外网访问学校 CAS。

---

## 2. 准备工作

### 2.1 获取代码

在服务器上拉取项目代码：

```bash
# 方法一：Git 克隆（推荐）
git clone https://github.com/你的用户名/huas-server.git
cd huas-server

# 方法二：手动上传
# 用 scp 或 SFTP 工具把项目文件夹上传到服务器
scp -r ./huas-server user@your-server:/opt/huas-server
```

### 2.2 创建配置文件

```bash
cd /opt/huas-server    # 进入项目目录（下面所有命令都在这个目录下执行）

cp .env.example .env   # 复制环境变量模板
```

### 2.3 编辑配置

```bash
nano .env
```

**必须修改的内容**：

```env
# 服务端口，默认 3000，一般不用改
PORT=3000

# 运行环境，部署时必须设为 production
NODE_ENV=production

# JWT 密钥 —— 【必须修改】
# 用下面的命令生成一个随机密钥：
#   openssl rand -base64 32
# 把生成的字符串粘贴到这里
JWT_SECRET=这里替换成你生成的随机字符串

# 数据库路径，默认即可
DB_PATH=./data/huas.db

# 日志级别：debug / info / warn / error
LOG_LEVEL=info
```

**生成 JWT 密钥**（复制粘贴到终端执行）：

```bash
openssl rand -base64 32
```

会输出类似 `aB3dE5fG7hI9jK1lM3nO5pQ7rS9tU1vW3xY5zA7b=` 的字符串，把它填到 `JWT_SECRET=` 后面。

---

## 3. 方式一：裸机部署（Bun + PM2）

适合想直接在服务器上运行、不想用 Docker 的场景。

### 3.1 安装 Bun

```bash
# 一键安装 Bun（官方脚本）
curl -fsSL https://bun.sh/install | bash

# 让当前终端识别 bun 命令
source ~/.bashrc
# 如果你用的是 zsh：
# source ~/.zshrc

# 验证安装
bun --version
# 应该输出类似 1.x.x 的版本号
```

### 3.2 安装 PM2

PM2 是一个进程管理器，可以让你的服务在后台运行、崩溃自动重启、开机自启。

```bash
# 用 bun 全局安装 PM2
bun add -g pm2

# 验证安装
pm2 --version
```

> 如果 `pm2` 命令找不到，试试 `export PATH="$HOME/.bun/bin:$PATH"` 然后重新执行。

### 3.3 安装依赖

```bash
cd /opt/huas-server
bun install
```

### 3.4 创建数据和日志目录

```bash
mkdir -p data logs
```

### 3.5 启动服务

**方法 A：使用一键部署脚本**

```bash
./deploy.sh
```

脚本会自动检查环境、安装依赖、用 PM2 启动服务。

**方法 B：手动启动**

```bash
# 用 PM2 启动
pm2 start ecosystem.config.cjs

# 查看运行状态
pm2 status

# 查看日志
pm2 logs huas-server
```

### 3.6 验证服务

```bash
curl http://localhost:3000/health
```

正常输出：

```json
{"success":true,"data":{"status":"ok","timestamp":"...","uptime":1.23}}
```

### 3.7 设置开机自启

```bash
# 生成开机启动脚本
pm2 startup

# 上面的命令会输出一行需要你执行的命令，类似：
# sudo env PATH=$PATH:/home/user/.bun/bin pm2 startup systemd -u user --hp /home/user
# 复制并执行那行命令

# 保存当前进程列表
pm2 save
```

### 3.8 常用 PM2 命令速查

```bash
pm2 status              # 查看所有进程状态
pm2 logs huas-server    # 查看实时日志（Ctrl+C 退出）
pm2 restart huas-server # 重启服务
pm2 stop huas-server    # 停止服务
pm2 delete huas-server  # 删除服务（需要重新 start 才能启动）
pm2 monit               # 实时监控面板（CPU、内存）
```

---

## 4. 方式二：Docker 部署

适合熟悉 Docker 的用户，环境隔离，不污染宿主机。

### 4.1 安装 Docker

```bash
# Ubuntu / Debian
curl -fsSL https://get.docker.com | sh

# 把当前用户加入 docker 组（免 sudo）
sudo usermod -aG docker $USER

# 重新登录终端使生效
exit
# 重新 SSH 连接

# 验证
docker --version
```

### 4.2 构建镜像

```bash
cd /opt/huas-server
docker build -t huas-server .
```

首次构建需要下载 Bun 基础镜像，大约需要 1-3 分钟。

### 4.3 创建数据目录

```bash
mkdir -p data logs
```

### 4.4 运行容器

```bash
docker run -d \
  --name huas-server \
  --restart unless-stopped \
  -p 3000:3000 \
  -v $(pwd)/data:/app/data \
  -v $(pwd)/logs:/app/logs \
  -e NODE_ENV=production \
  -e JWT_SECRET="你的JWT密钥" \
  -e DB_PATH=/app/data/huas.db \
  huas-server
```

**参数解释**：

| 参数 | 含义 |
|------|------|
| `-d` | 后台运行 |
| `--name huas-server` | 容器名称，方便后续操作 |
| `--restart unless-stopped` | 崩溃自动重启，手动 stop 后不重启 |
| `-p 3000:3000` | 端口映射：宿主机 3000 → 容器 3000 |
| `-v $(pwd)/data:/app/data` | 数据库文件挂载到宿主机，容器删除数据不丢 |
| `-v $(pwd)/logs:/app/logs` | 日志文件挂载到宿主机 |
| `-e JWT_SECRET=...` | 传入环境变量 |

### 4.5 验证

```bash
# 查看容器状态
docker ps

# 查看日志
docker logs -f huas-server

# 测试健康检查
curl http://localhost:3000/health
```

### 4.6 常用 Docker 命令速查

```bash
docker ps                        # 查看运行中的容器
docker logs -f huas-server       # 查看实时日志（Ctrl+C 退出）
docker logs --tail 100 huas-server  # 查看最近 100 行日志
docker restart huas-server       # 重启
docker stop huas-server          # 停止
docker start huas-server         # 启动（之前 stop 的）
docker rm -f huas-server         # 强制删除容器
docker stats huas-server         # 实时查看 CPU/内存占用
```

---

## 5. 方式三：Docker Compose 部署（推荐）

最简单的方式，一条命令搞定。

### 5.1 安装 Docker 和 Docker Compose

```bash
# 安装 Docker（包含 Docker Compose）
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
exit
# 重新 SSH 连接

# 验证
docker compose version
```

> 新版 Docker 已内置 `docker compose`（注意是空格不是横线），不需要单独安装 `docker-compose`。

### 5.2 配置

确保 `.env` 文件已创建并设置了 `JWT_SECRET`（参考 [2.3 编辑配置](#23-编辑配置)）。

### 5.3 启动

```bash
cd /opt/huas-server

# 构建并启动（后台运行）
docker compose up -d --build
```

完事了。第一次会自动构建镜像。

### 5.4 验证

```bash
# 查看状态
docker compose ps

# 查看日志
docker compose logs -f

# 测试
curl http://localhost:3000/health
```

### 5.5 常用 Docker Compose 命令速查

```bash
docker compose up -d         # 启动（后台）
docker compose up -d --build # 重新构建并启动（代码更新后用这个）
docker compose down          # 停止并删除容器（数据不丢，在 data/ 目录）
docker compose restart       # 重启
docker compose logs -f       # 查看实时日志
docker compose ps            # 查看状态
```

---

## 6. 配置 Nginx 反向代理

如果你想用域名访问，或者需要 HTTPS，就需要 Nginx。

### 6.1 安装 Nginx

```bash
# Ubuntu / Debian
sudo apt update
sudo apt install -y nginx

# 验证
nginx -v
```

### 6.2 创建站点配置

```bash
sudo nano /etc/nginx/sites-available/huas-server
```

粘贴以下内容（把 `your-domain.com` 替换成你的域名）：

**纯 HTTP 版本（没有域名或不需要 HTTPS）**：

```nginx
server {
    listen 80;
    server_name your-domain.com;    # 替换为你的域名或 IP

    client_max_body_size 1m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Connection "";

        # 学校 CAS 有时比较慢，给足超时时间
        proxy_connect_timeout 5s;
        proxy_read_timeout 30s;
        proxy_send_timeout 10s;
    }

    # 健康检查不记日志
    location = /health {
        proxy_pass http://127.0.0.1:3000;
        access_log off;
    }
}
```

### 6.3 启用站点

```bash
# 创建软链接启用
sudo ln -s /etc/nginx/sites-available/huas-server /etc/nginx/sites-enabled/

# 删除默认站点（可选）
sudo rm -f /etc/nginx/sites-enabled/default

# 测试配置是否正确
sudo nginx -t

# 重新加载 Nginx
sudo systemctl reload nginx
```

### 6.4 如果用 IP 直接访问

把上面配置中的 `server_name` 改成下划线：

```nginx
server_name _;
```

然后直接用服务器 IP 访问即可。

---

## 7. 配置 HTTPS（SSL 证书）

需要先有一个域名，并且域名已经解析到服务器 IP。

### 7.1 安装 Certbot

```bash
# Ubuntu / Debian
sudo apt install -y certbot python3-certbot-nginx
```

### 7.2 申请证书（自动配置）

```bash
sudo certbot --nginx -d your-domain.com
```

按照提示操作：
1. 输入邮箱
2. 同意服务条款（输入 Y）
3. 选择是否重定向 HTTP 到 HTTPS（选 2，自动重定向）

Certbot 会自动修改 Nginx 配置并配置好 HTTPS。

### 7.3 验证自动续期

Let's Encrypt 证书有效期 90 天，Certbot 会自动续期。验证定时器：

```bash
sudo systemctl status certbot.timer
```

手动测试续期（不会真的续期，只是测试）：

```bash
sudo certbot renew --dry-run
```

---

## 8. 环境变量说明

| 变量 | 必填 | 默认值 | 说明 |
|------|------|--------|------|
| `PORT` | 否 | `3000` | 服务监听端口 |
| `NODE_ENV` | 否 | 无 | 设为 `production` 关闭测试页、启用生产优化 |
| `JWT_SECRET` | **是** | 内置默认值 | 用户 Token 签名密钥，**必须修改** |
| `DB_PATH` | 否 | `./data/huas.db` | SQLite 数据库文件路径 |
| `LOG_LEVEL` | 否 | `info` | 日志级别：`debug` `info` `warn` `error` |

---

## 9. 日常运维

### 9.1 查看服务状态

```bash
# PM2 方式
pm2 status

# Docker 方式
docker ps
# 或
docker compose ps
```

### 9.2 健康检查

```bash
curl http://localhost:3000/health
```

正常返回：

```json
{"success":true,"data":{"status":"ok","timestamp":"...","uptime":12345.67}}
```

- `status: "ok"` — 数据库连接正常
- `uptime` — 服务已运行秒数

可以结合定时任务做监控告警：

```bash
# 添加定时健康检查（每 5 分钟）
crontab -e
```

添加一行：

```
*/5 * * * * curl -sf http://localhost:3000/health > /dev/null || echo "HUAS Server is down!" | mail -s "Alert" you@email.com
```

### 9.3 查看实时日志

```bash
# PM2
pm2 logs huas-server

# Docker
docker logs -f huas-server

# Docker Compose
docker compose logs -f

# 直接看日志文件
tail -f logs/huas-$(date +\%Y-\%m-\%d).log
```

### 9.4 重启服务

```bash
# PM2
pm2 restart huas-server

# Docker
docker restart huas-server

# Docker Compose
docker compose restart
```

---

## 10. 日志管理

### 10.1 日志文件位置

```
logs/
├── huas-2026-03-06.log      # 每日应用日志（自动轮转）
├── error-2026-03-06.log     # 每日错误日志
├── pm2-out.log              # PM2 标准输出（仅 PM2 方式）
└── pm2-error.log            # PM2 错误输出（仅 PM2 方式）
```

### 10.2 日志自动轮转规则

应用自带日志轮转（winston-daily-rotate-file）：

| 配置 | 值 |
|------|-----|
| 按天分割 | `huas-YYYY-MM-DD.log` |
| 单文件上限 | 20 MB |
| 保留天数 | 应用日志 14 天，错误日志 30 天 |

超过保留天数的日志文件会自动删除，无需手动清理。

### 10.3 终端日志标签含义

实时日志中你会看到这些彩色标签：

| 标签 | 含义 |
|------|------|
| `SRV` | 服务器事件（启动、定时任务） |
| `POST` / `GET` | HTTP 请求日志 |
| `AUTH` | 用户正常登录 |
| `CAS↻` | 后台静默重认证（自动刷新凭证） |
| `ERR` | 错误（登录失败、异常） |
| `WARN` | 警告 |

### 10.4 手动清理旧日志

```bash
# 删除 30 天前的日志
find logs/ -name "*.log" -mtime +30 -delete
```

---

## 11. 数据库管理

### 11.1 数据库文件位置

默认路径：`data/huas.db`

这是一个 SQLite 文件，包含三张表：

| 表名 | 内容 | 说明 |
|------|------|------|
| `users` | 用户信息 | 学号、姓名、加密密码 |
| `credentials` | 学校凭证 | TGC、Portal JWT、JW Session |
| `cache` | 数据缓存 | 课表、成绩等缓存数据 |

### 11.2 备份数据库

```bash
# 简单复制（需要先停止服务或确保数据库处于 WAL 模式）
cp data/huas.db data/huas-backup-$(date +%Y%m%d).db

# 用 sqlite3 做在线备份（不需要停止服务）
sqlite3 data/huas.db ".backup data/huas-backup-$(date +%Y%m%d).db"
```

建议每天自动备份：

```bash
crontab -e
```

添加一行：

```
0 3 * * * sqlite3 /opt/huas-server/data/huas.db ".backup /opt/huas-server/data/backup-$(date +\%Y\%m\%d).db"
```

每天凌晨 3 点自动备份。

### 11.3 清理备份

```bash
# 保留最近 7 天的备份
find data/ -name "backup-*.db" -mtime +7 -delete
```

### 11.4 查看数据库内容

```bash
# 安装 sqlite3（如果没有）
sudo apt install -y sqlite3

# 打开数据库
sqlite3 data/huas.db

# 常用查询
.tables                              -- 查看所有表
SELECT COUNT(*) FROM users;          -- 用户数量
SELECT student_id, name, last_login_at FROM users ORDER BY last_login_at DESC LIMIT 10;  -- 最近登录的 10 个用户
SELECT COUNT(*) FROM credentials;    -- 凭证数量
SELECT COUNT(*) FROM cache;          -- 缓存条目数
.quit                                -- 退出
```

### 11.5 自动清理机制

服务内置了自动清理定时任务（每小时执行一次）：

- 删除过期的 `credentials`（TGC、Session 等）
- 删除过期的 `cache` 条目

无需手动清理。

---

## 12. 更新升级

### 12.1 裸机（PM2）更新

```bash
cd /opt/huas-server

# 1. 拉取最新代码
git pull origin main

# 2. 安装新依赖（如果 package.json 有变化）
bun install

# 3. 重启服务
pm2 restart huas-server
```

### 12.2 Docker 更新

```bash
cd /opt/huas-server

# 1. 拉取最新代码
git pull origin main

# 2. 重新构建镜像
docker build -t huas-server .

# 3. 停止旧容器
docker stop huas-server
docker rm huas-server

# 4. 用新镜像启动（命令同 4.4）
docker run -d \
  --name huas-server \
  --restart unless-stopped \
  -p 3000:3000 \
  -v $(pwd)/data:/app/data \
  -v $(pwd)/logs:/app/logs \
  -e NODE_ENV=production \
  -e JWT_SECRET="你的JWT密钥" \
  -e DB_PATH=/app/data/huas.db \
  huas-server
```

### 12.3 Docker Compose 更新

```bash
cd /opt/huas-server

# 1. 拉取最新代码
git pull origin main

# 2. 一条命令搞定：重新构建 + 重启
docker compose up -d --build
```

### 12.4 回滚

如果更新后出问题：

```bash
# 查看 Git 历史
git log --oneline -10

# 回到上一个版本
git checkout 上一个commit的hash

# 重启服务
pm2 restart huas-server          # PM2
docker compose up -d --build     # Docker Compose
```

---

## 13. 故障排查

### 13.1 服务无法启动

**现象**：`pm2 status` 显示 `errored` 或 `stopped`

```bash
# 查看错误日志
pm2 logs huas-server --err --lines 50

# Docker 方式
docker logs huas-server
```

**常见原因**：

| 错误信息 | 原因 | 解决 |
|---------|------|------|
| `EACCES: permission denied` | 文件权限不足 | `chmod -R 755 data/ logs/` |
| `EADDRINUSE` | 端口被占用 | `lsof -i :3000` 找到占用进程，kill 掉或换端口 |
| `Cannot find module` | 依赖未安装 | `bun install` |

### 13.2 登录失败

**现象**：用户登录返回 `error_code: 3001`

```bash
# 查看 AUTH 相关日志
grep "AUTH\|ERR\|CAS" logs/huas-$(date +%Y-%m-%d).log | tail -20
```

**常见原因**：

| 情况 | 说明 |
|------|------|
| `您提供的用户名或者密码有误` | 密码错误，让用户确认密码 |
| `学校服务器超时` | 学校 CAS 系统不可达或太慢 |
| `教务系统激活失败` | JW 系统故障，一般等待学校恢复 |
| `需要验证码` | 账号触发了学校的风控 |

### 13.3 数据获取失败

**现象**：已登录用户请求 /api/schedule 等返回错误

```bash
# 检查凭证状态
sqlite3 data/huas.db "SELECT system, expires_at FROM credentials WHERE user_id = 1;"
```

**常见原因**：

| error_code | 说明 | 处理 |
|-----------|------|------|
| 3003 | 凭证过期，静默重认证也失败 | 用户需要重新登录 |
| 3004 | 学校服务器超时 | 等待学校恢复 |
| 4001 | JWT 过期（90天到期） | 用户重新登录 |

### 13.4 无法连接学校

```bash
# 测试连通性
curl -I https://cas.huas.edu.cn
curl -I https://portal.huas.edu.cn
curl -I https://jw.huas.edu.cn
```

如果超时或拒绝连接：
- 检查服务器是否在校园网内
- 检查防火墙规则：`sudo iptables -L`
- 检查 DNS：`nslookup cas.huas.edu.cn`

### 13.5 磁盘空间不足

```bash
# 查看磁盘使用
df -h

# 查看日志占用
du -sh logs/

# 清理旧日志
find logs/ -name "*.log" -mtime +14 -delete

# 清理旧数据库备份
find data/ -name "backup-*.db" -mtime +7 -delete
```

### 13.6 内存占用过高

```bash
# 查看进程内存
pm2 monit           # PM2
docker stats        # Docker

# 如果持续增长，可能是内存泄漏，重启服务
pm2 restart huas-server
```

PM2 配置了 `max_memory_restart: '256M'`，超过 256MB 会自动重启。

---

## 14. 安全建议

### 14.1 必做

- **修改 JWT_SECRET**：不要使用默认值，用 `openssl rand -base64 32` 生成
- **设置 NODE_ENV=production**：关闭开发测试页面
- **限制端口访问**：3000 端口不要直接暴露到公网，通过 Nginx 代理

```bash
# 防火墙只允许 80/443，禁止外网直接访问 3000
sudo ufw allow 80
sudo ufw allow 443
sudo ufw allow 22       # SSH
sudo ufw deny 3000      # 禁止外网直连
sudo ufw enable
```

### 14.2 建议

- 使用 HTTPS（参考第 7 节）
- 定期备份数据库（参考 11.2）
- 关注日志中的 `ERR` 和 `WARN`
- 定期更新系统和依赖：`sudo apt update && sudo apt upgrade`

---

## 快速参考卡片

```
┌────────────────────────────────────────────────┐
│              HUAS Server 速查表                │
├────────────────────────────────────────────────┤
│                                                │
│  健康检查    curl localhost:3000/health         │
│                                                │
│  ── PM2 ──                                     │
│  状态        pm2 status                        │
│  日志        pm2 logs huas-server              │
│  重启        pm2 restart huas-server           │
│  监控        pm2 monit                         │
│                                                │
│  ── Docker Compose ──                          │
│  启动        docker compose up -d --build      │
│  停止        docker compose down               │
│  日志        docker compose logs -f            │
│  重启        docker compose restart            │
│                                                │
│  ── 数据库 ──                                  │
│  备份        sqlite3 data/huas.db ".backup     │
│              data/backup-$(date +%Y%m%d).db"   │
│  查看        sqlite3 data/huas.db              │
│                                                │
│  ── 日志文件 ──                                │
│  位置        logs/huas-YYYY-MM-DD.log          │
│  错误        logs/error-YYYY-MM-DD.log         │
│  清理        find logs/ -mtime +14 -delete     │
│                                                │
│  ── 更新 ──                                    │
│  PM2         git pull && bun install &&        │
│              pm2 restart huas-server           │
│  Compose     git pull &&                       │
│              docker compose up -d --build      │
│                                                │
└────────────────────────────────────────────────┘
```
